#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { configExists, loadConfig, saveConfig } from "../config/store.js";
import { loadTemplates, seedTemplateDbIfEmpty, updateTemplates } from "../db/loader.js";
import { askBoolean, askNumber, askString } from "../cli/utilities.js";
import {
  buildEnvironmentIndex,
  getEnvironmentIndexPath,
  writeEnvironmentIndex,
} from "../index/environmentIndex.js";
import { runPipeline } from "../core/pipeline.js";
import { printFunctionCall, setDebugEnabled } from "../core/debug.js";
import { printBashIntegrationHint } from "../shell/bash.js";
import { printZshIntegrationHint } from "../shell/zsh.js";
import { runConfigurator } from "./configurator.js";
import {
  ExecutionTier,
  ReviewState,
  RiskClass,
} from "../Interfaces/types.js";

interface ParsedArgs {
  dryRun: boolean;
  debug: boolean;
  update: boolean;
  listIntents: boolean;
  configCommand: boolean;
  prompt: string | null;
}

function formatRiskLabel(risk: RiskClass): string {
  const label = risk.replaceAll("_", " ").toUpperCase();
  switch (risk) {
    case RiskClass.Safe:
      return chalk.green(label);
    case RiskClass.SemiSafe:
      return chalk.cyan(label);
    case RiskClass.Mutating:
      return chalk.yellow(label);
    case RiskClass.Privileged:
      return chalk.hex("#ff8c00")(label);
    case RiskClass.Destructive:
      return chalk.red.bold(label);
    case RiskClass.Unknown:
      return chalk.redBright.bold(label);
    default:
      return label;
  }
}

function formatTierLabel(tier: ExecutionTier): string {
  switch (tier) {
    case ExecutionTier.T0:
      return chalk.green(tier);
    case ExecutionTier.T1:
      return chalk.cyan(tier);
    case ExecutionTier.T2:
      return chalk.yellow(tier);
    case ExecutionTier.T3:
      return chalk.red.bold(tier);
    default:
      return tier;
  }
}

function formatProvenanceLabel(provenance: ReviewState): string {
  const label = provenance.replaceAll("_", " ");
  switch (provenance) {
    case ReviewState.OwnerReviewed:
      return chalk.green(label);
    case ReviewState.CommunityReviewed:
      return chalk.cyan(label);
    case ReviewState.Unreviewed:
      return chalk.yellow(label);
    case ReviewState.Generated:
      return chalk.red.bold(label);
    default:
      return label;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  printFunctionCall("cli.index.parseArgs", { argc: argv.length });
  const args = [...argv];
  const parsed: ParsedArgs = {
    dryRun: false,
    debug: false,
    update: false,
    listIntents: false,
    configCommand: false,
    prompt: null,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
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
  const rl = readline.createInterface({ input, output });
  try {
    console.log("Installation consent:");
    console.log("Templates are packaged with the application. Some of them can run without confirmation. So you need to be sure you trust the source of these templates.");
    const consent = await askBoolean(rl, "Trust this repo / template source?", false);

    config.enableTier0Immediate = await askBoolean(rl, "Enable immediate execution for safer commands (Tier-0)?", true);

    config.uploadGeneratedTemplates = await askBoolean(rl, "Upload generated templates/edits?", false);;

    await saveConfig(config);
    console.log(chalk.green("Config saved."));
    await seedTemplateDbIfEmpty();
    printBashIntegrationHint();
    printZshIntegrationHint();
  } finally {
    rl.close();
  }
}

async function bootstrapIfNeeded(): Promise<void> {
  if (await configExists()) {
    return;
  }

  console.log(chalk.cyan("First run detected. Starting install flow..."));
  await firstRunFlow();
}

async function readPromptInteractive(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question("> ")).trim();
  } finally {
    rl.close();
  }
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
  
  await bootstrapIfNeeded();

  const parsed = parseArgs(process.argv.slice(2));
  
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

  const decision = await runPipeline(prompt, config, {
    dryRun: parsed.dryRun,
  });

  console.log(
    `[${formatTierLabel(decision.tier)}] Risk: ${formatRiskLabel(decision.risk)} Provenance: ${formatProvenanceLabel(decision.provenance)}`,
  );
  console.log(decision.explanation);

  if (decision.command) {
    console.log(decision.command);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${message}`));
  process.exitCode = 1;
});
