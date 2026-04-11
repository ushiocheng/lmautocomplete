import chalk from "chalk";
import { printFunctionCall } from "../core/debug.js";
import { ShellIntegration } from "./interface.js";

export class BashIntegration implements ShellIntegration {
    printIntegrationHint(): void {
        printFunctionCall("shell.bash.printBashIntegrationHint");
        console.log("Bash integration hint:");
        console.log('Add function to ~/.bashrc: a() { command a "$@"; }');
    }

    editableBuffer(command: string): string {
        console.log(chalk.yellow("WARN: Editable buffer not implemented for bash yet."));
        console.log(command);
        return command;
    }

    executeCommand(command: string): void {
        console.log(chalk.yellow("WARN: Command execution not implemented for bash yet."));
        console.log(command);
    }

    insertCommand(command: string): void {
        console.log(chalk.yellow("WARN: Command insertion not implemented for bash yet."));
        console.log(command);
    }
}
