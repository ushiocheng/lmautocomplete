import { printFunctionCall } from "../core/debug.js";

export function printZshIntegrationHint(): void {
  printFunctionCall("shell.zsh.printZshIntegrationHint");
  console.log("Zsh integration hint:");
  console.log('Add function to ~/.zshrc: a() { command a "$@"; }');
}
