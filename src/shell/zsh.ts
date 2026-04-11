import chalk from "chalk";
import { printFunctionCall } from "../core/debug.js";
import { ShellIntegration } from "./interface.js";

export class ZshIntegration implements ShellIntegration {
    printIntegrationHint(): void {
        printFunctionCall("shell.zsh.printZshIntegrationHint");
        console.log("Zsh integration hint:");
        console.log('Add function to ~/.zshrc: a() { command a "$@"; }');
    }

    editableBuffer(command: string): string {
        console.log(chalk.yellow("WARN: Editable buffer not implemented for zsh yet."));
        console.log(command);
        return command;
    }

    executeCommand(command: string): void {
        console.log(chalk.yellow("WARN: Command execution not implemented for zsh yet."));
        console.log(command);
    }

    insertCommand(command: string): void {
        console.log(chalk.yellow("WARN: Command insertion not implemented for zsh yet."));
        console.log(command);
    }
}
