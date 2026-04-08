import { askBoolean, askNumber, askString } from "../cli/utilities.js";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { printFunctionCall } from "../core/debug.js";
import { getConfigPath, loadConfig, saveConfig } from "../config/store.js";
import type { AppConfig, ModelEndpointConfig } from "../Interfaces/types.js";

function toYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function maskToken(token?: string): string {
  if (!token) {
    return "(empty)";
  }
  if (token.length <= 6) {
    return "******";
  }
  return `${token.slice(0, 3)}...${token.slice(-3)}`;
}

/**
 * Configure a model endpoint by asking the user for input.
 * @param rl Readline interface
 * @param name Name of the endpoint (for display purposes)
 * @param endpoint Current endpoint configuration
 * @returns Updated endpoint configuration
 */
async function configureEndpoint(
  rl: readline.Interface,
  name: string,
  endpoint: ModelEndpointConfig,
): Promise<ModelEndpointConfig> {
  printFunctionCall("cli.configurator.configureEndpoint", { name });
  console.log(chalk.cyan(`\nConfiguring ${name}`));
  const updated: ModelEndpointConfig = { ...endpoint };

  updated.enabled = await askBoolean(rl, `${name}.enabled`, updated.enabled);
  updated.baseUrl = await askString(rl, `${name}.baseUrl`, updated.baseUrl);
  updated.model = await askString(rl, `${name}.model`, updated.model);
  updated.timeoutMs = await askNumber(rl, `${name}.timeoutMs`, updated.timeoutMs, 100);

  console.log(`${name}.apiKey: ${maskToken(updated.apiKey)}`);
  const setApiKey = await askBoolean(rl, `Change ${name}.apiKey`, false);
  if (setApiKey) {
    const token = await askString(rl, `${name}.apiKey`, "");
    updated.apiKey = token;
  }

  return updated;
}

// todo: Review this function
function printConfigSummary(config: AppConfig): void {
  printFunctionCall("cli.configurator.printConfigSummary");
  console.log(chalk.bold("\nCurrent config"));
  console.log(`1) consentGiven: ${toYesNo(config.consentGiven)}`);
  console.log(`2) enableTier0Immediate: ${toYesNo(config.enableTier0Immediate)}`);
  console.log(`3) uploadGeneratedTemplates: ${toYesNo(config.uploadGeneratedTemplates)}`);
  console.log(`4) environmentIndexTtlDays: ${config.environmentIndexTtlDays}`);
  console.log(
    `5) classifierEndpoint: enabled=${toYesNo(config.classifierEndpoint.enabled)} baseUrl=${config.classifierEndpoint.baseUrl || "(empty)"} model=${config.classifierEndpoint.model || "(empty)"} timeoutMs=${config.classifierEndpoint.timeoutMs} apiKey=${maskToken(config.classifierEndpoint.apiKey)}`,
  );
  console.log(
    `6) generatorEndpoint: enabled=${toYesNo(config.generatorEndpoint.enabled)} baseUrl=${config.generatorEndpoint.baseUrl || "(empty)"} model=${config.generatorEndpoint.model || "(empty)"} timeoutMs=${config.generatorEndpoint.timeoutMs} apiKey=${maskToken(config.generatorEndpoint.apiKey)}`,
  );
  console.log(`7) templateRepo: ${config.templateRepo}`);
  console.log(`8) templateRepoRef: ${config.templateRepoRef}`);
  console.log("9) Save and exit");
  console.log("10) Exit without saving");
}

// todo: Review this function
export async function runConfigurator(): Promise<void> {
  printFunctionCall("cli.configurator.runConfigurator");
  const config = await loadConfig();
  const rl = readline.createInterface({ input, output });
  let shouldSave = false;

  try {
    while (true) {
      printConfigSummary(config);
      const choice = (await rl.question("Choose option: ")).trim();

      if (choice === "1") {
        config.consentGiven = await askBoolean(rl, "consentGiven", config.consentGiven);
      } else if (choice === "2") {
        config.enableTier0Immediate = await askBoolean(rl, "enableTier0Immediate", config.enableTier0Immediate);
      } else if (choice === "3") {
        config.uploadGeneratedTemplates = await askBoolean(rl, "uploadGeneratedTemplates", config.uploadGeneratedTemplates);
      } else if (choice === "4") {
        config.environmentIndexTtlDays = await askNumber(
          rl,
          "environmentIndexTtlDays",
          config.environmentIndexTtlDays,
          1,
        );
      } else if (choice === "5") {
        config.classifierEndpoint = await configureEndpoint(rl, "classifierEndpoint", config.classifierEndpoint);
      } else if (choice === "6") {
        config.generatorEndpoint = await configureEndpoint(rl, "generatorEndpoint", config.generatorEndpoint);
      } else if (choice === "7") {
        config.templateRepo = await askString(rl, "templateRepo", config.templateRepo);
      } else if (choice === "8") {
        config.templateRepoRef = await askString(rl, "templateRepoRef", config.templateRepoRef);
      } else if (choice === "9") {
        shouldSave = true;
        break;
      } else if (choice === "10") {
        break;
      } else {
        console.log(chalk.yellow("Invalid option."));
      }
    }
  } finally {
    rl.close();
  }

  if (shouldSave) {
    await saveConfig(config);
    console.log(chalk.green(`Config saved to ${getConfigPath()}`));
  } else {
    console.log(chalk.gray("No changes saved."));
  }
}
