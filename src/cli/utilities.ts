import readline from "node:readline/promises";
import chalk from "chalk";

let promptInterface: readline.Interface | null = null;
let testModeEnabled = false;

export function setPromptInterface(rl: readline.Interface): void {
    promptInterface = rl;
}

export function clearPromptInterface(): void {
    promptInterface = null;
}

export function setTestMode(enabled: boolean): void {
    testModeEnabled = enabled;
}

export function isTestMode(): boolean {
    return testModeEnabled;
}

function getPromptInterface(rl?: readline.Interface): readline.Interface {
    const active = rl ?? promptInterface;
    if (!active) {
        throw new Error("Prompt interface is not initialized.");
    }
    return active;
}

export async function askQuestion(question: string): Promise<string> {
    if (testModeEnabled) {
        return "";
    }
    const prompt = getPromptInterface();
    return prompt.question(question);
}

export async function askBoolean(
    question: string,
    current: boolean // current config value or default
): Promise<boolean> {
    if (testModeEnabled) {
        return true;
    }
    const prompt = getPromptInterface();
    const answer = (await prompt.question(`${question} [${current ? "Y/n" : "y/N"}] `)).trim().toLowerCase();
    if (!answer) {
        return current;
    }
    return answer === "y" || answer === "yes";
}

export async function askNumber(
    question: string,
    current = 1, // current config value or default
    min = 1, // minimum acceptable value
    max = Number.MAX_SAFE_INTEGER // maximum acceptable value
): Promise<number> {
    if (testModeEnabled) {
        return current;
    }
    const prompt = getPromptInterface();
    const answer = (await prompt.question(`${question} (${current}): `)).trim();
    if (!answer) {
        return current;
    }
    const parsed = Number.parseInt(answer, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        console.log(chalk.yellow(`Invalid value, keeping ${current}.`));
        return current;
    }
    return parsed;
}

/**
 * Ask the user for a string input.
 * @param question Question to ask the user
 * @param current Current config value or default
 * @returns The user's input or the current value if input is empty
 * @remark Answer will be trimmed of leading and trailing whitespace.
 */
export async function askString(
    question: string,
    current: string // current config value or default
): Promise<string> {
    if (testModeEnabled) {
        return current;
    }
    const prompt = getPromptInterface();
    const answer = await prompt.question(`${question} (${current || "empty"}): `);
    const trimmed = answer.trim();
    if (!trimmed) {
        return current;
    }
    return trimmed;
}

export function assert(condition: any, message?: string): asserts condition {
    if (!condition) {
        console.error(message || "Assertion failed");
        process.exit(2);
    }
}
