import chalk from "chalk";

export type Platform = "linux" | "macos";

export function formatRiskLabel(risk: RiskClass): string {
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

export function formatTierLabel(tier: ExecutionTier): string {
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

export function formatProvenanceLabel(provenance: ReviewState): string {
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

export enum RiskClass {
    Safe = "Safe",
    SemiSafe = "Semi_Safe",
    Mutating = "Mutating",
    Privileged = "Privileged",
    Destructive = "Destructive",
    Unknown = "Unknown",
}

export enum ReviewState {
    OwnerReviewed = "Owner_Reviewed",
    CommunityReviewed = "Community_Reviewed",
    Unreviewed = "Unreviewed",
    Generated = "Generated",
}

export enum ExecutionTier {
    T0 = "T0",
    T1 = "T1",
    T2 = "T2",
    T3 = "T3",
}

export interface TemplateEntry {
    intent: string;
    summary: string;
    slots: string[];
    template_by_platform: Partial<Record<Platform, string>>;
    depends_on: Partial<Record<Platform, string[]>>;
    risk: RiskClass;
    review_state: ReviewState;
}

export interface GeneratedTemplateDraft {
    intent: string;
    summary: string;
    slots: string[];
    template: string;
    depends_on: string[];
}

export interface NormalizedInput {
    raw: string;
    normalized: string;
    quotedTokens: string[];
}

export interface ClassifierResult {
    intent: string | null;
    slots: Record<string, string>;
    confidence: number;
    needs_fallback: boolean;
}

export interface GeneratorResult {
    template: GeneratedTemplateDraft;
    command_preview: string;
    explanation: string;
    confidence: number;
}

export interface EnvironmentIndex {
    generated_at: number;
    shell: string;
    os: Platform | "unknown";
    commands: {
        builtin: string[];
        installed: string[];
    };
}

export interface TemplateMatch {
    template: TemplateEntry;
    rendered?: string;
    slotValues: Record<string, string>;
    confidence: number;
}

export interface ModelEndpointConfig {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeoutMs: number;
}

export interface AppConfig {
    enableTier0Immediate: boolean;
    uploadGeneratedTemplates: boolean;
    classifierEndpoint: ModelEndpointConfig;
    generatorEndpoint: ModelEndpointConfig;
    environmentIndexTtlDays: number;
    templateRepo: string;
    templateRepoRef: string;
}
