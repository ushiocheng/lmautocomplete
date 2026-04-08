import readline from "node:readline/promises";

export async function askBoolean(
  rl: readline.Interface,
  question: string,
  current: boolean, // current config value or default
): Promise<boolean> {
  const answer = (await rl.question(`${question} [${current ? "Y/n" : "y/N"}] `)).trim().toLowerCase();
  if (!answer) {
    return current;
  }
  return answer === "y" || answer === "yes";
}

export async function askNumber(
  rl: readline.Interface,
  question: string,
  current: number, // current config value or default
  min = 1, // minimum acceptable value
  max = Number.MAX_SAFE_INTEGER, // maximum acceptable value
): Promise<number> {
  const answer = (await rl.question(`${question} (${current}): `)).trim();
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
 * @param rl Readline interface
 * @param question Question to ask the user
 * @param current Current config value or default
 * @returns The user's input or the current value if input is empty
 * @remark Answer will be trimmed of leading and trailing whitespace.
 */
export async function askString(
  rl: readline.Interface,
  question: string,
  current: string, // current config value or default
): Promise<string> {
  const answer = await rl.question(`${question} (${current || "empty"}): `);
  const trimmed = answer.trim();
  if (!trimmed) {
    return current;
  }
  return trimmed;
}
