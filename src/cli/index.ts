#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { configExists, loadConfig, saveConfig } from "../config/store.js";
import { loadTemplates, seedTemplateDbIfEmpty, updateTemplatesFromGitHub } from "../db/loader.js";
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
} from "../models/types.js";

interface ParsedArgs {
  dryRun: boolean;
  debug: boolean;
  refresh: boolean;
  update: boolean;
  listIntents: boolean;
  configCommand: boolean;
  prompt: string | null;
}

function formatRiskLabel(risk: RiskClass): string {
  printFunctionCall("cli.index.formatRiskLabel", { risk });
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
  printFunctionCall("cli.index.formatTierLabel", { tier });
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
  printFunctionCall("cli.index.formatProvenanceLabel", { provenance });
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
    refresh: false,
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
    } else if (arg === "--refresh") {
      parsed.refresh = true;
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

async function askInstallConsent(): Promise<void> {
  printFunctionCall("cli.index.askInstallConsent");
  const config = await loadConfig();
  const rl = readline.createInterface({ input, output });
  try {
    console.log("Installation consent:");
    console.log("Templates are packaged with the application. Some of them can run without confirmation. So you need to be sure you trust the source of these templates.");
    const consent = (await rl.question("Trust this repo / template source? [y/N] ")).trim().toLowerCase();
    config.consentGiven = consent === "y";

    const tier0 = (await rl.question("Enable immediate execution for safer commands (Tier-0)? [Y/n] ")).trim().toLowerCase();
    config.enableTier0Immediate = tier0 !== "n";

    const upload = (await rl.question("Upload generated templates/edits? [y/N] ")).trim().toLowerCase();
    config.uploadGeneratedTemplates = upload === "y";

    await saveConfig(config);
    await seedTemplateDbIfEmpty();
    console.log(chalk.green("Config saved."));
    printBashIntegrationHint();
    printZshIntegrationHint();
  } finally {
    rl.close();
  }
}

async function bootstrapIfNeeded(): Promise<void> {
  printFunctionCall("cli.index.bootstrapIfNeeded");
  if (await configExists()) {
    return;
  }

  console.log(chalk.cyan("First run detected. Starting install flow..."));
  await askInstallConsent();
}

async function readPromptInteractive(): Promise<string> {
  printFunctionCall("cli.index.readPromptInteractive");
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question("> ")).trim();
  } finally {
    rl.close();
  }
}

async function refreshEnvironmentIndex(): Promise<void> {
  printFunctionCall("cli.index.refreshEnvironmentIndex");
  const rebuilt = await buildEnvironmentIndex();
  await writeEnvironmentIndex(rebuilt);
  console.log(chalk.green(`Environment index refreshed at ${getEnvironmentIndexPath()}`));
}

async function listIntents(): Promise<void> {
  printFunctionCall("cli.index.listIntents");
  const templates = await loadTemplates();
  for (const t of templates) {
    console.log(`${t.intent}: ${t.summary}`);
  }
}

async function updateTemplates(): Promise<void> {
  printFunctionCall("cli.index.updateTemplates");
  const config = await loadConfig();
  const result = await updateTemplatesFromGitHub(config.templateRepo, config.templateRepoRef);
  console.log(chalk.green(`Updated ${result.updated} template(s) in ${result.templateDir}`));
}

async function main(): Promise<void> {
  printFunctionCall("cli.index.main");
  setDebugEnabled(process.argv.includes("--debug"));
  const parsed = parseArgs(process.argv.slice(2));
  setDebugEnabled(parsed.debug);

  await bootstrapIfNeeded();

  if (parsed.configCommand) {
    await runConfigurator();
    return;
  }

  if (parsed.refresh) {
    await refreshEnvironmentIndex();
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
    debug: parsed.debug,
  });

  console.log(
    `[${formatTierLabel(decision.tier)}] Risk: ${formatRiskLabel(decision.risk)} Provenance: ${formatProvenanceLabel(decision.provenance)}`,
  );
  console.log(decision.explanation);

  if (decision.command) {
    console.log(decision.command);
  }

  if (parsed.debug) {
    for (const line of decision.debug) {
      console.log(`[DEBUG] ${line}`);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${message}`));
  process.exitCode = 1;
});
