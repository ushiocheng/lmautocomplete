import chalk from "chalk";
import { printFunctionCall } from "../core/debug.js";
import { ShellIntegration } from "./interface.js";

export class UnknownShellIntegration implements ShellIntegration {
    printIntegrationHint(): void {
        printFunctionCall("shell.unknown.printUnknownIntegrationHint");
        console.log("Unknown shell integration hint:");
        console.log('Try adding the following function to your shell configuration: a() { command a "$@"; }');
    }

    editableBuffer(command: string): string {
        console.log(chalk.red("WARN: Unknown Shell. Fallback."));
        return command;
    }

    executeCommand(command: string): void {
        console.log(chalk.red("WARN: Unknown Shell. Fallback."));
    }

    insertCommand(command: string): void {
        console.log(chalk.red("WARN: Unknown Shell. Fallback."));
    }
}
