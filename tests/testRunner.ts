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

interface TestRunOutcome {
    testCase: TestCase;
    result: RunResult;
    passed: boolean;
    logPath: string;
}

const ROOT_DIR = process.cwd();
const TEST_DIR = join(ROOT_DIR, "tests");
const TEST_CASES_PATH = join(TEST_DIR, "testcases.jsonc");
const LOG_DIR = join(TEST_DIR, "testlogs");
const TEST_TIMEOUT_MS = 15_000;

async function runCommand(prompt: string, timeoutMs: number): Promise<RunResult> {
    return await new Promise<RunResult>((resolve) => {
        const child = spawn("npm", ["run", "dev", "--", "--debug", "--dry-run", prompt], {
            cwd: ROOT_DIR,
            shell: process.platform === "win32",
            env: process.env,
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            stderr += `Timed out after ${timeoutMs}ms.\n`;
            child.kill("SIGKILL");
        }, timeoutMs);

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

async function runTestCase(testCase: TestCase): Promise<TestRunOutcome> {
    const result = await runCommand(testCase.prompt, TEST_TIMEOUT_MS);
    const didError = result.exitCode !== 0;
    const passed = didError === testCase.shouldError;
    const logPath = join(LOG_DIR, `${testCase.name}.log`);
    await fs.writeFile(logPath, toLogContent(testCase, result), "utf-8");

    return {
        testCase,
        result,
        passed,
        logPath,
    };
}

async function main(): Promise<void> {
    const raw = await fs.readFile(TEST_CASES_PATH, "utf-8");
    const testCases = JSON.parse(raw) as TestCase[];

    await fs.mkdir(LOG_DIR, { recursive: true });
    // Empties Log Dir
    const logFiles = await fs.readdir(LOG_DIR);
    for (const file of logFiles) {
        await fs.unlink(join(LOG_DIR, file));
    }

    const outcomes = await Promise.all(testCases.map((testCase) => runTestCase(testCase)));

    let failedCount = 0;
    for (const outcome of outcomes) {
        if (!outcome.passed) {
            failedCount += 1;
            const didError = outcome.result.exitCode !== 0;
            if (!outcome.testCase.shouldError && didError) {
                console.log(`Unexpected error in ${outcome.testCase.name}`);
                console.log(`See log: ${outcome.logPath}`);
            }
        }
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
