import { askBoolean, askNumber, askString } from "../cli/utilities.js";
import chalk from "chalk";
import { printFunctionCall } from "../core/debug.js";
import { getConfigPath, loadConfig, saveConfig } from "../config/store.js";
import type { AppConfig, ModelEndpointConfig } from "../Interfaces/types.js";

function toColoredYesNo(value: boolean): string {
    return value ? chalk.green("Yes") : chalk.red("No");
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
async function configureEndpoint(name: string, endpoint: ModelEndpointConfig): Promise<ModelEndpointConfig> {
    printFunctionCall("cli.configurator.configureEndpoint", { name });
    console.log(chalk.cyan(`\nConfiguring ${name}`));
    const updated: ModelEndpointConfig = { ...endpoint };

    updated.enabled = await askBoolean(`${name}.enabled`, updated.enabled);
    updated.baseUrl = await askString(`${name}.baseUrl`, updated.baseUrl);
    updated.model = await askString(`${name}.model`, updated.model);
    updated.timeoutMs = await askNumber(`${name}.timeoutMs`, updated.timeoutMs, 100);

    console.log(`${name}.apiKey: ${maskToken(updated.apiKey)}`);
    const setApiKey = await askBoolean(`Change ${name}.apiKey`, false);
    if (setApiKey) {
        const token = await askString(`${name}.apiKey`, "");
        updated.apiKey = token;
    }

    return updated;
}

function printConfigSummary(config: AppConfig): void {
    printFunctionCall("cli.configurator.printConfigSummary");
    console.log(chalk.bold("\nCurrent config"));
    console.log(`1) Enable Immediate Execution for Tier 0: ${toColoredYesNo(config.enableTier0Immediate)}`);
    console.log(`2) Upload Generated Templates: ${toColoredYesNo(config.uploadGeneratedTemplates)}`);
    console.log(`3) Environment Index TTL Days: ${config.environmentIndexTtlDays}`);
    console.log(
        `4) Classifier Endpoint: enabled=${toColoredYesNo(config.classifierEndpoint.enabled)} baseUrl=${config.classifierEndpoint.baseUrl || "(empty)"} model=${config.classifierEndpoint.model || "(empty)"} timeoutMs=${config.classifierEndpoint.timeoutMs} apiKey=${maskToken(config.classifierEndpoint.apiKey)}`
    );
    console.log(
        `5) Generator Endpoint: enabled=${toColoredYesNo(config.generatorEndpoint.enabled)} baseUrl=${config.generatorEndpoint.baseUrl || "(empty)"} model=${config.generatorEndpoint.model || "(empty)"} timeoutMs=${config.generatorEndpoint.timeoutMs} apiKey=${maskToken(config.generatorEndpoint.apiKey)}`
    );
    console.log(`6) Template Repo: ${config.templateRepo}`);
    console.log(`7) Template Repo Ref: ${config.templateRepoRef}`);
    console.log("8) Save and exit");
    console.log("9) Exit without saving");
}

export async function runConfigurator(): Promise<void> {
    printFunctionCall("cli.configurator.runConfigurator");
    const config = await loadConfig();
    let shouldSave = false;

    inputLoop: while (true) {
        printConfigSummary(config);
        const choice = await askNumber("Choose option:", 9, 1);
        switchChoice: switch (choice) {
            case 1:
                config.enableTier0Immediate = await askBoolean(
                    "Enable Immediate Execution for Tier 0: ",
                    config.enableTier0Immediate
                );
                break switchChoice;
            case 2:
                config.uploadGeneratedTemplates = await askBoolean(
                    "Upload Generated Templates: ",
                    config.uploadGeneratedTemplates
                );
                break switchChoice;
            case 3:
                config.environmentIndexTtlDays = await askNumber(
                    "Environment Index TTL Days",

                    config.environmentIndexTtlDays,
                    1
                );
                break switchChoice;
            case 4:
                config.classifierEndpoint = await configureEndpoint("Classifier Endpoint", config.classifierEndpoint);
                break switchChoice;
            case 5:
                config.generatorEndpoint = await configureEndpoint("Generator Endpoint", config.generatorEndpoint);
                break switchChoice;
            case 6:
                config.templateRepo = await askString("Template Repo", config.templateRepo);
                break switchChoice;
            case 7:
                config.templateRepoRef = await askString("Template Repo Ref", config.templateRepoRef);
                break switchChoice;
            case 8:
                shouldSave = true;
                break inputLoop;
            case 9:
                break inputLoop;
            default:
                console.log(chalk.yellow("Invalid option. Try again."));
        }
    }

    if (shouldSave) {
        await saveConfig(config);
        console.log(chalk.green(`Config saved to ${getConfigPath()}`));
    } else {
        console.log(chalk.gray("No changes saved."));
    }
}
