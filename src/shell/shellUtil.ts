import { ShellIntegration } from "./interface.js";
import { BashIntegration } from "./bash.js";
import { ZshIntegration } from "./zsh.js";
import { UnknownShellIntegration } from "./fallback.js";
import chalk from "chalk";

export enum Shell {
    Bash = "bash",
    Zsh = "zsh",
    Unknown = "unknown",
}

let currentShell: Shell | null = null;
let integrationForCurrentShellSingleton: ShellIntegration | null = null;
let dryRunEnabled = false;

export function setDryRun(enabled: boolean): void {
    dryRunEnabled = enabled;
}

export function detectShell(): Shell {
    if (currentShell !== null) return currentShell;
    const shellName = process.env.SHELL?.split("/").pop()?.toLowerCase();
    if (shellName === "bash") {
        currentShell = Shell.Bash;
    } else if (shellName === "zsh") {
        currentShell = Shell.Zsh;
    } else {
        currentShell = Shell.Unknown;
    }
    return currentShell;
}

function integrationForCurrentShell(): ShellIntegration {
    if (integrationForCurrentShellSingleton !== null) return integrationForCurrentShellSingleton;
    switch (detectShell()) {
        case Shell.Bash:
            integrationForCurrentShellSingleton = new BashIntegration();
            break;
        case Shell.Zsh:
            integrationForCurrentShellSingleton = new ZshIntegration();
            break;
        default:
            integrationForCurrentShellSingleton = new UnknownShellIntegration();
            break;
    }
    return integrationForCurrentShellSingleton;
}

export function printIntegrationHint(): void {
    integrationForCurrentShell().printIntegrationHint();
}

export function editableBuffer(command: string): string {
    return integrationForCurrentShell().editableBuffer(command);
}

export function executeCommand(command: string): void {
    if (dryRunEnabled) {
        console.log(chalk.cyan(`Dry-run (execute): ${command}`));
        return;
    }
    integrationForCurrentShell().executeCommand(command);
}

export function insertCommand(command: string): void {
    if (dryRunEnabled) {
        console.log(chalk.cyan(`Dry-run (insert): ${command}`));
        return;
    }
    integrationForCurrentShell().insertCommand(command);
}
