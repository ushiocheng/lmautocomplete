#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { configExists, loadConfig, saveConfig } from "../config/store.js";
import { loadTemplates, updateTemplates } from "../db/loader.js";
import { askBoolean, askQuestion, clearPromptInterface, setPromptInterface, setTestMode } from "../cli/utilities.js";
import { runPipelineBlocking } from "../core/pipeline.js";
import { printFunctionCall, setDebugEnabled } from "../core/debug.js";
import { printIntegrationHint, setDryRun } from "../shell/shellUtil.js";
import { runConfigurator } from "./configurator.js";

interface ParsedArgs {
    dryRun: boolean;
    testMode: boolean;
    debug: boolean;
    update: boolean;
    listIntents: boolean;
    configCommand: boolean;
    prompt: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
    printFunctionCall("cli.index.parseArgs", { argc: argv.length });
    const args = [...argv];
    const parsed: ParsedArgs = {
        dryRun: false,
        testMode: false,
        debug: false,
        update: false,
        listIntents: false,
        configCommand: false,
        prompt: null,
    };

    for (const arg of args) {
        if (arg === "--dry-run") {
            parsed.dryRun = true;
        } else if (arg === "--test-mode") {
            parsed.testMode = true;
        } else if (arg === "--debug") {
            parsed.debug = true;
        } else if (arg === "update") {
            parsed.update = true;
        } else if (arg === "--list-intents") {
            parsed.listIntents = true;
        } else if (arg === "config") {
            parsed.configCommand = true;
        } else if (!arg.startsWith("-") && parsed.prompt === null) {
            parsed.prompt = arg;
        }
    }

    return parsed;
}

async function firstRunFlow(): Promise<void> {
    printFunctionCall("cli.index.firstRunFlow");
    const config = await loadConfig();
    console.log("Installation consent:");
    console.log(
        "Templates are packaged with the application. Some of them can run without confirmation. So you need to be sure you trust the source of these templates. You must accept to continue."
    );
    const consent = await askBoolean("Trust this repo / template source?", true);
    if (!consent) process.exit(3);

    config.enableTier0Immediate = await askBoolean("Enable immediate execution for safer commands (Tier-0)?", true);

    config.uploadGeneratedTemplates = await askBoolean("Upload generated templates/edits?", false);

    await saveConfig(config);
    console.log(chalk.green("Config saved."));
    await loadTemplates();
    printIntegrationHint();
}

async function bootstrapIfNeeded(): Promise<void> {
    if (await configExists()) {
        return;
    }

    console.log(chalk.cyan("First run detected. Starting install flow..."));
    await firstRunFlow();
}

async function readPromptInteractive(): Promise<string> {
    return (await askQuestion("> ")).trim();
}

async function listIntents(): Promise<void> {
    printFunctionCall("cli.index.listIntents");
    const templates = await loadTemplates();
    for (const t of templates) {
        console.log(`${t.intent}: ${t.summary}`);
    }
}

async function main(): Promise<void> {
    printFunctionCall("cli.index.main");
    setDebugEnabled(process.argv.includes("--debug"));

    const rl = readline.createInterface({ input, output });
    setPromptInterface(rl);
    try {
        await bootstrapIfNeeded();

        const parsed = parseArgs(process.argv.slice(2));
        setDryRun(parsed.dryRun);
        setTestMode(parsed.dryRun && parsed.testMode);

        if (parsed.configCommand) {
            await runConfigurator();
            return;
        }

        if (parsed.update) {
            await updateTemplates();
            return;
        }

        if (parsed.listIntents) {
            await listIntents();
            return;
        }

        const config = await loadConfig();

        const prompt = parsed.prompt ?? (await readPromptInteractive());
        if (!prompt) {
            console.error("No instruction provided.");
            process.exitCode = 1;
            return;
        }
        await runPipelineBlocking(prompt, config);
    } finally {
        clearPromptInterface();
        rl.close();
    }
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Fatal: ${message}`));
    process.exitCode = 1;
});
