import { printFunctionCall } from "../core/debug.js";

export function printBashIntegrationHint(): void {
  printFunctionCall("shell.bash.printBashIntegrationHint");
  console.log("Bash integration hint:");
  console.log('Add function to ~/.bashrc: a() { command a "$@"; }');
}
