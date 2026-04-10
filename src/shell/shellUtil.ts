import { ShellIntegration } from "./interface.js";
import { bashIntegration } from "./bash.js";
import { zshIntegration } from "./zsh.js";
import { unknownShellIntegration } from "./fallback.js";

export enum Shell {
	Bash = "bash",
	Zsh = "zsh",
	Unknown = "unknown",
}

let currentShell: Shell | null = null;

export function detectShell(): Shell {
    if (currentShell !== null) return currentShell;
	const shellName = process.env.SHELL?.split("/").pop()?.toLowerCase();
	if (shellName === "bash") {
        currentShell = Shell.Bash;
	}else if (shellName === "zsh") {
        currentShell = Shell.Zsh;
	} else {
        currentShell = Shell.Unknown;
    }
	return currentShell;
}

function integrationForCurrentShell(): ShellIntegration {
    switch (detectShell()) {
        case Shell.Bash:
            return new bashIntegration();
        case Shell.Zsh:
            return new zshIntegration();
        default:
            return new unknownShellIntegration();
    }
}

export function printIntegrationHint(): void {
    integrationForCurrentShell().printIntegrationHint();
}

export function editableBuffer(command: string): string {
    return integrationForCurrentShell().editableBuffer(command);
}

export function executeCommand(command: string): void {
    integrationForCurrentShell().executeCommand(command);
}

export function insertCommand(command: string): void {
    integrationForCurrentShell().insertCommand(command);
}
