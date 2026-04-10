import * as fs from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

interface TestCase {
    name: string;
    prompt: string;
    shouldError: boolean;
}

interface RunResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

type TestStatus = "passed" | "failed" | "stuck";

interface TestRunOutcome {
    testCase: TestCase;
    result: RunResult;
    status: TestStatus;
    logPath: string;
}

interface WorkerBatchResult {
    outcomes: TestRunOutcome[];
    respawn: boolean;
}

interface RunnerConfig {
    rootDir: string;
    logDir: string;
    timeoutMs: number;
    rateLimitMs: number;
    workerCount: number;
}

interface TestQueue {
    take(): TestCase | null;
    hasRemaining(): boolean;
}

const ROOT_DIR = process.cwd();
const TEST_DIR = join(ROOT_DIR, "tests");
const TEST_CASES_PATH = join(TEST_DIR, "testcases.json");
const LOG_DIR = join(TEST_DIR, "testlogs");
const DEFAULT_TEST_TIMEOUT_MS = 15000;
const DEFAULT_TEST_RATE_LIMIT_MS = 100;
const DEFAULT_WORKER_COUNT = 10;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number.parseInt(process.env[name] ?? "", 10);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return value;
}

function createRunnerConfig(totalTests: number): RunnerConfig {
    const requestedWorkers = readPositiveIntegerEnv("LMA_TEST_WORKERS", DEFAULT_WORKER_COUNT);
    return {
        rootDir: ROOT_DIR,
        logDir: LOG_DIR,
        timeoutMs: readPositiveIntegerEnv("LMA_TEST_TIMEOUT_MS", DEFAULT_TEST_TIMEOUT_MS),
        rateLimitMs: readPositiveIntegerEnv("LMA_TEST_RATE_LIMIT_MS", DEFAULT_TEST_RATE_LIMIT_MS),
        workerCount: totalTests === 0 ? 0 : Math.min(requestedWorkers, totalTests),
    };
}

async function loadTestCases(testCasesPath: string): Promise<TestCase[]> {
    const raw = await fs.readFile(testCasesPath, "utf-8");
    return JSON.parse(raw) as TestCase[];
}

async function prepareLogDirectory(logDir: string): Promise<void> {
    await fs.mkdir(logDir, { recursive: true });
    const logFiles = await fs.readdir(logDir);
    await Promise.all(logFiles.map((file) => fs.unlink(join(logDir, file))));
}

async function runCommand(prompt: string, config: RunnerConfig): Promise<RunResult> {
    return await new Promise<RunResult>((resolve) => {
        const child = spawn("npm", ["run", "dev", "--", "--debug", "--dry-run", prompt], {
            cwd: config.rootDir,
            shell: process.platform === "win32",
            env: process.env,
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            stderr += `Timed out after ${config.timeoutMs}ms.\n`;
            child.kill("SIGKILL");
        }, config.timeoutMs);

        const finish = (exitCode: number) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            resolve({
                exitCode,
                stdout,
                stderr,
                timedOut,
            });
        };

        child.stdout.on("data", (chunk: Buffer | string) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
        });

        child.on("close", (code) => {
            finish(code ?? 1);
        });

        child.on("error", (err) => {
            stderr += `${String(err)}\n`;
            finish(1);
        });
    });
}

function toLogContent(testCase: TestCase, result: RunResult): string {
    return [
        `name: ${testCase.name}`,
        `prompt: ${testCase.prompt}`,
        `shouldError: ${testCase.shouldError}`,
        `command: npm run dev -- --debug ${JSON.stringify(testCase.prompt)}`,
        `exitCode: ${result.exitCode}`,
        `timedOut: ${result.timedOut}`,
        "",
        "--- stdout ---",
        result.stdout,
        "",
        "--- stderr ---",
        result.stderr,
        "",
    ].join("\n");
}

function classifyOutcome(testCase: TestCase, result: RunResult): TestStatus {
    if (result.timedOut) {
        return "stuck";
    }
    const didError = result.exitCode !== 0;
    return didError === testCase.shouldError ? "passed" : "failed";
}

async function runTestCase(testCase: TestCase, config: RunnerConfig): Promise<TestRunOutcome> {
    const result = await runCommand(testCase.prompt, config);
    const status = classifyOutcome(testCase, result);
    const logPath = join(config.logDir, `${testCase.name}.log`);
    await fs.writeFile(logPath, toLogContent(testCase, result), "utf-8");

    return {
        testCase,
        result,
        status,
        logPath,
    };
}

function createTestQueue(testCases: TestCase[]): TestQueue {
    let nextTestIndex = 0;
    return {
        take(): TestCase | null {
            const testCase = testCases[nextTestIndex] ?? null;
            if (testCase) {
                nextTestIndex += 1;
            }
            return testCase;
        },
        hasRemaining(): boolean {
            return nextTestIndex < testCases.length;
        },
    };
}

function createStartLimiter(intervalMs: number): () => Promise<void> {
    let nextAllowedAt = 0;
    let chain = Promise.resolve();

    return async () => {
        const previous = chain;
        let release!: () => void;
        chain = new Promise<void>((resolve) => {
            release = resolve;
        });

        await previous;
        const waitMs = Math.max(0, nextAllowedAt - Date.now());
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        nextAllowedAt = Date.now() + intervalMs;
        release();
    };
}

async function runWorker(
    queue: TestQueue,
    config: RunnerConfig,
    waitForStartSlot: () => Promise<void>
): Promise<WorkerBatchResult> {
    const outcomes: TestRunOutcome[] = [];

    while (true) {
        const testCase = queue.take();
        if (!testCase) {
            return {
                outcomes,
                respawn: false,
            };
        }

        await waitForStartSlot();
        const outcome = await runTestCase(testCase, config);
        outcomes.push(outcome);

        if (outcome.status === "stuck") {
            return {
                outcomes,
                respawn: true,
            };
        }
    }
}

async function runPool(testCases: TestCase[], config: RunnerConfig): Promise<TestRunOutcome[]> {
    if (config.workerCount === 0) {
        return [];
    }

    const queue = createTestQueue(testCases);
    const waitForStartSlot = createStartLimiter(config.rateLimitMs);
    const outcomes: TestRunOutcome[] = [];
    const activeWorkers = new Map<number, Promise<WorkerBatchResult>>();
    let nextWorkerId = 1;

    const spawnWorker = (): void => {
        const workerId = nextWorkerId;
        nextWorkerId += 1;
        activeWorkers.set(workerId, runWorker(queue, config, waitForStartSlot));
    };

    for (let workerIndex = 0; workerIndex < config.workerCount; workerIndex += 1) {
        spawnWorker();
    }

    while (activeWorkers.size > 0) {
        const completed = await Promise.race(
            [...activeWorkers.entries()].map(([workerId, promise]) =>
                promise.then((result) => ({
                    workerId,
                    result,
                }))
            )
        );

        activeWorkers.delete(completed.workerId);
        outcomes.push(...completed.result.outcomes);

        if (completed.result.respawn && queue.hasRemaining()) {
            spawnWorker();
        }
    }

    return outcomes;
}

function reportOutcome(outcome: TestRunOutcome): void {
    if (outcome.status === "passed") {
        return;
    }

    if (outcome.status === "stuck") {
        console.log(`Stuck test in ${outcome.testCase.name}`);
        console.log(`See log: ${outcome.logPath}`);
        return;
    }

    const didError = outcome.result.exitCode !== 0;
    if (!outcome.testCase.shouldError && didError) {
        console.log(`Unexpected error in ${outcome.testCase.name}`);
        console.log(`See log: ${outcome.logPath}`);
        return;
    }

    console.log(`Unexpected result in ${outcome.testCase.name}`);
    console.log(`See log: ${outcome.logPath}`);
}

async function main(): Promise<void> {
    const testCases = await loadTestCases(TEST_CASES_PATH);
    const config = createRunnerConfig(testCases.length);
    await prepareLogDirectory(config.logDir);

    const outcomes = await runPool(testCases, config);
    const failedCount = outcomes.filter((outcome) => outcome.status !== "passed").length;
    for (const outcome of outcomes) {
        reportOutcome(outcome);
    }

    console.log(`Test run complete. Failed: ${failedCount}`);
    if (failedCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
});
