import chalk from "chalk";
import { printFunctionCall, printIfDebug } from "./debug.js";
import { editSlots, fillMissingSlotsIfAny, renderTemplate } from "./render.js";
import { resolveExecutionTier } from "./trust.js";
import { normalizeInput } from "./normalize.js";
import { findTemplatesByIntent, saveGeneratedTemplate } from "../db/loader.js";
import { getEnvironmentIndex } from "../index/environmentIndex.js";
import {
    ExecutionTier,
    ReviewState,
    RiskClass,
    formatTierLabel,
    formatRiskLabel,
    formatProvenanceLabel,
    type AppConfig,
    type Platform,
    GeneratorResult,
} from "../Interfaces/types.js";
import { OpenAIClassifierAdapter } from "../model-adapters/openaiClassifier.js";
import { OpenAIGeneratorAdapter } from "../model-adapters/openaiGenerator.js";
import { askBoolean, assert } from "../cli/utilities.js";
import { editableBuffer, executeCommand, insertCommand } from "../shell/shellUtil.js";

function resolvePlatform(os: string): Platform | null {
    if (os === "linux" || os === "macos") return os;
    return null;
}

async function insertOrExecute(command: string, tier: ExecutionTier, config: AppConfig): Promise<void> {
    printFunctionCall("core.pipeline.insertOrExecute", {
        command,
        tier,
        enableTier0Immediate: config.enableTier0Immediate,
    });

    if (tier === ExecutionTier.T0) {
        if (!config.enableTier0Immediate) {
            console.log(chalk.yellow("T0 immediate execution disabled by config; inserting command:"));
            insertCommand(command);
            return;
        }
        console.log(chalk.green(`Running: ${command}`));
        executeCommand(command);
        return;
    }
    console.log(chalk.blue(`Inserting Command: ${command}`));
    insertCommand(command);
}

/**
 * Completes Tier 3 flow, returns a boolean if the input is unedited & accepted for storage
 */
async function runTier3Flow(generated: GeneratorResult): Promise<boolean> {
    printFunctionCall("core.pipeline.runTier3Flow");
    console.log(chalk.red("--------------------------------------------------"));
    console.log(chalk.red(" WARNING: LLM Generated, review before proceeding"));
    console.log(chalk.red("--------------------------------------------------"));

    // Show explanation and preview
    console.log(renderTemplate(generated.template.template, {}));
    console.log(`\nExplanation: ${generated.template.intent}: ${generated.template.summary}`);
    const preview = renderTemplate(generated.template.template, generated.slotGuesses);
    console.log(`\nPreview:\n${preview}`);
    console.log(chalk.red("--------------------------------------------------"));

    const accept = await askBoolean("Accept Generated Template?", false);
    if (accept) {
        const editedSlots = await editSlots(generated.template.template, generated.slotGuesses);
        const final = renderTemplate(generated.template.template, editedSlots);
        console.log(chalk.blue(`>> ${final}`));
        const proceed = await askBoolean("Proceed with this command?", false);
        if (proceed) {
            insertCommand(final);
            return true;
        }
    }

    // const revise = await askBoolean(rl,"Revise Prompt?",false);
    // if (revise) {
    //   console.log(chalk.gray("Prompt revision flow not implemented yet in v1 scaffold."));
    // }
    return false;
}

export async function runPipeline(instruction: string, config: AppConfig): Promise<void> {
    printFunctionCall("core.pipeline.runPipeline", { instruction });
    const normalized = normalizeInput(instruction);
    printIfDebug("core.pipeline.runPipeline", `Normalized input: ${normalized.normalized}`);

    const classifier = new OpenAIClassifierAdapter(); // todo: add new classifier options
    const classifierResult = await classifier.classify(normalized, config.classifierEndpoint);
    printIfDebug("core.pipeline.runPipeline", `LM.intent: ${classifierResult.intent}`);
    printIfDebug("core.pipeline.runPipeline", `LM.confidence: ${classifierResult.confidence.toFixed(2)}`);
    printIfDebug("core.pipeline.runPipeline", "LM.slots:", classifierResult.slots);

    const env = await getEnvironmentIndex(config.environmentIndexTtlDays);
    const platform = resolvePlatform(env.os);
    let generateCommand = false;

    if (classifierResult.confidence < 0.8) generateCommand = true;

    const template = classifierResult.intent ? await findTemplatesByIntent(classifierResult.intent) : null;

    if (!platform) {
        console.log(chalk.yellow(`Unknown OS platform ${env.os}.`));
        generateCommand = true;
    }
    if (!template) {
        console.log(chalk.yellow("No template matched."));
        generateCommand = true;
    } else if (!(platform && template?.template_by_platform?.[platform])) {
        console.log(chalk.yellow("Template found does not support current OS."));
        generateCommand = true;
    }

    if (!generateCommand) {
        assert(platform);
        const platformTemplate = template?.template_by_platform?.[platform] ?? null;

        assert(template && platformTemplate);
        const tier = resolveExecutionTier(template.risk, template.review_state);
        const filledSlots = await fillMissingSlotsIfAny(platformTemplate, classifierResult.slots);
        const rendered = renderTemplate(platformTemplate, filledSlots);

        console.log(
            `[${formatTierLabel(tier)}] Risk: ${formatRiskLabel(template.risk)}  Provenance: ${formatProvenanceLabel(template.review_state)}`
        );

        if (tier === ExecutionTier.T2) {
            console.log(chalk.yellow("Warning: This command is not audited."));
            if (template.review_state === ReviewState.Unreviewed) {
                console.log(chalk.red("Warning: Unreviewed command template."));
            }
        }
        if (template.risk === RiskClass.Destructive) {
            console.log(chalk.red("Warning: Destructive command."));
        }

        await insertOrExecute(rendered, tier, config);
        return;
    } // Implicit else, Generating command logic after this line

    if (!config.generatorEndpoint.enabled) {
        const msg = "No trusted template matched and generation endpoint is not configured. Configure generator endpoint to enable Tier-3 suggestions.";
        console.log(
            chalk.yellow(
                msg
            )
        );
        throw new Error(msg);
    }

    const generator = new OpenAIGeneratorAdapter();
    const generated = await generator.generate(normalized, config.generatorEndpoint);
    const accepted = await runTier3Flow(generated);
    if (accepted) {
        if (!platform) {
            printIfDebug("core.pipeline.runPipeline", "Generated template not saved because platform is unsupported.");
            return;
        }
        const savedPath = await saveGeneratedTemplate(platform, generated.template);
        printIfDebug(
            "core.pipeline.runPipeline",
            savedPath
                ? `Saved generated template: ${savedPath}`
                : "Generated template not saved due to intent collision with non-generated template."
        );
    }
}

export async function runPipelineBlocking(instruction: string, config: AppConfig): Promise<void> {
    // Explicit sequencing boundary for callers.
    await runPipeline(instruction, config);
}
