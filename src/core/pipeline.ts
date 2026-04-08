import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { printFunctionCall } from "./debug.js";
import { classifyHeuristically } from "./heuristics.js";
import { fillMissingSlots, listMissingSlots, renderTemplate } from "./render.js";
import { resolveExecutionTier } from "./trust.js";
import { normalizeInput } from "./normalize.js";
import {
  checkDependencyStatus,
  findTemplatesByIntent,
  getTemplateDependencies,
  getTemplateForPlatform,
  loadTemplates,
  saveGeneratedTemplate,
  scoreTemplateTextMatch,
} from "../db/loader.js";
import { getEnvironmentIndex } from "../index/environmentIndex.js";
import {
  ExecutionTier,
  ReviewState,
  RiskClass,
  type AppConfig,
  type ClassifierResult,
  type PipelineDecision,
  type Platform,
  type TemplateMatch,
} from "../models/types.js";
import { OpenAIClassifierAdapter } from "../model-adapters/openaiClassifier.js";
import { OpenAIGeneratorAdapter } from "../model-adapters/openaiGenerator.js";

interface RunOptions {
  dryRun: boolean;
  debug: boolean;
}

function mergeSlots(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  printFunctionCall("core.pipeline.mergeSlots");
  return { ...a, ...b };
}

function resolvePlatform(osName: string): Platform | null {
  printFunctionCall("core.pipeline.resolvePlatform", { osName });
  if (osName === "linux" || osName === "macos") {
    return osName;
  }
  return null;
}

function selectBestMatch(matches: TemplateMatch[]): TemplateMatch | null {
  printFunctionCall("core.pipeline.selectBestMatch", { count: matches.length });
  if (matches.length === 0) {
    return null;
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.dependency.executable !== b.dependency.executable) {
      return a.dependency.executable ? -1 : 1;
    }
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    const provenanceRank: Record<ReviewState, number> = {
      [ReviewState.OwnerReviewed]: 3,
      [ReviewState.CommunityReviewed]: 2,
      [ReviewState.Unreviewed]: 1,
      [ReviewState.Generated]: 0,
    };
    const p = provenanceRank[b.template.review_state] - provenanceRank[a.template.review_state];
    if (p !== 0) {
      return p;
    }
    return b.slotValues ? Object.keys(b.slotValues).length - Object.keys(a.slotValues).length : 0;
  });

  return sorted[0] ?? null;
}

async function insertOrExecute(command: string, tier: ExecutionTier, options: RunOptions, config: AppConfig): Promise<void> {
  printFunctionCall("core.pipeline.insertOrExecute", { tier });
  if (options.dryRun) {
    console.log(chalk.cyan(`Dry-run: ${command}`));
    return;
  }

  if (tier === ExecutionTier.T0) {
    if (!config.enableTier0Immediate) {
      console.log(chalk.yellow("T0 immediate execution disabled by config; printing command:"));
      console.log(command);
      return;
    }

    console.log(chalk.green(`Running: ${command}`));
    await new Promise<void>((resolve) => {
      const child = spawn(command, { shell: true, stdio: "inherit" });
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
    });
    return;
  }

  console.log(command);
  console.log(chalk.gray("Insert into shell line buffer is expected via shell integration; command printed for now."));
}

async function runTier3Flow(command: string, options: RunOptions): Promise<boolean> {
  printFunctionCall("core.pipeline.runTier3Flow");
  console.log(chalk.red("--------------------------------------------------"));
  console.log(chalk.red(" WARNING: LLM Generated, review before proceeding"));
  console.log(chalk.red("--------------------------------------------------"));
  console.log(command);
  console.log(chalk.red("--------------------------------------------------"));

  if (options.dryRun) {
    return false;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const accept = (await rl.question("Accept Generated Command? [Y/N] ")).trim().toLowerCase();
    if (accept === "y") {
      console.log(chalk.gray("Command accepted. Insert into shell is delegated to shell integration; printing command."));
      console.log(command);
      return true;
    }

    const revise = (await rl.question("Revise Prompt? [Y/n] ")).trim().toLowerCase();
    if (revise === "y" || revise === "") {
      console.log(chalk.gray("Prompt revision flow not implemented yet in v1 scaffold."));
    }
    return false;
  } finally {
    rl.close();
  }
}

export async function runPipeline(
  instruction: string,
  config: AppConfig,
  options: RunOptions,
): Promise<PipelineDecision> {
  printFunctionCall("core.pipeline.runPipeline", { instruction });
  const debug: string[] = [];
  debug.push(`Entered: ${instruction}`);

  const normalized = normalizeInput(instruction);
  debug.push(`Normalized input: ${normalized.normalized}`);

  const heuristic = classifyHeuristically(normalized);
  debug.push(`Heuristic: ${heuristic ? heuristic.intent : "null"}`);

  const classifier = new OpenAIClassifierAdapter();
  let classifierResult: ClassifierResult = {
    intent: null,
    slots: {},
    confidence: 0,
    needs_fallback: true,
  };

  if (heuristic) {
    classifierResult = heuristic;
  } else {
    classifierResult = await classifier.classify(normalized, config.classifierEndpoint);
    debug.push(`LM.intent: ${classifierResult.intent}`);
    debug.push(`LM.confidence: ${classifierResult.confidence.toFixed(2)}`);
  }

  const templates = await loadTemplates();
  const env = await getEnvironmentIndex(config.environmentIndexTtlDays);
  const platform = resolvePlatform(env.os);

  if (!platform) {
    return {
      tier: ExecutionTier.T3,
      risk: RiskClass.Unknown,
      provenance: ReviewState.Generated,
      explanation: "Unsupported OS platform for template execution.",
      debug,
    };
  }

  const candidates = classifierResult.intent
    ? findTemplatesByIntent(templates, classifierResult.intent)
    : templates;

  const scored: TemplateMatch[] = [];
  for (const template of candidates) {
    const tpl = getTemplateForPlatform(template, platform);
    if (!tpl) {
      continue;
    }

    const slots = mergeSlots(normalized.candidates, classifierResult.slots);
    const required = getTemplateDependencies(template, platform);
    const dependency = checkDependencyStatus(required, env);
    const textScore = scoreTemplateTextMatch(template, normalized.normalized);
    const confidence = classifierResult.intent === template.intent
      ? Math.max(classifierResult.confidence, textScore)
      : textScore;

    scored.push({
      template,
      rendered: tpl,
      slotValues: slots,
      confidence,
      dependency,
    });
  }

  const best = selectBestMatch(scored.filter((x) => x.confidence > 0.2 || x.template.intent === classifierResult.intent));

  if (best && best.rendered) {
    const missingSlots = listMissingSlots(best.rendered, best.slotValues);
    const filledSlots = await fillMissingSlots(missingSlots, best.slotValues);
    const rendered = renderTemplate(best.rendered, filledSlots);

    if (!best.dependency.executable) {
      const explanation = `Template matched but missing dependencies: ${best.dependency.missing.join(", ")}`;
      debug.push(explanation);
      return {
        tier: ExecutionTier.T2,
        risk: best.template.risk,
        provenance: best.template.review_state,
        command: rendered,
        explanation,
        missingDependencies: best.dependency.missing,
        debug,
      };
    }

    const tier = resolveExecutionTier(best.template.risk, best.template.review_state);
    const decision: PipelineDecision = {
      tier,
      risk: best.template.risk,
      provenance: best.template.review_state,
      command: rendered,
      explanation: "Template matched and dependencies are satisfied.",
      debug,
    };

    if (tier === ExecutionTier.T2) {
      console.log(chalk.yellow("Warning: This command is not audited."));
      if (best.template.risk === RiskClass.Destructive) {
        console.log(chalk.red("Warning: Destructive command."));
      }
      if (best.template.review_state === ReviewState.Unreviewed) {
        console.log(chalk.hex("#ff8c00")("Warning: Unreviewed command template."));
      }
    }

    await insertOrExecute(rendered, tier, options, config);
    return decision;
  }

  if (!config.generatorEndpoint.enabled) {
    return {
      tier: ExecutionTier.T3,
      risk: RiskClass.Unknown,
      provenance: ReviewState.Generated,
      explanation:
        "No trusted template matched and generation endpoint is not configured. Configure generator endpoint to enable Tier-3 suggestions.",
      debug,
    };
  }

  const generator = new OpenAIGeneratorAdapter();
  const generated = await generator.generate(normalized, config.generatorEndpoint);
  const fallbackDecision: PipelineDecision = {
    tier: ExecutionTier.T3,
    risk: RiskClass.Unknown,
    provenance: ReviewState.Generated,
    command: generated.command_preview,
    explanation: generated.explanation,
    debug,
  };

  const accepted = await runTier3Flow(generated.command_preview, options);
  if (accepted) {
    const savedPath = await saveGeneratedTemplate(platform, generated.template);
    if (savedPath) {
      debug.push(`Saved generated template: ${savedPath}`);
    } else {
      debug.push("Generated template not saved due to intent collision with non-generated template.");
    }
  }
  return fallbackDecision;
}
