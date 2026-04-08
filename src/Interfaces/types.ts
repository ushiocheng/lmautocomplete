export type Platform = "linux" | "macos";

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

export interface DependencyStatus {
  executable: boolean;
  required: string[];
  missing: string[];
}

export interface TemplateMatch {
  template: TemplateEntry;
  rendered?: string;
  slotValues: Record<string, string>;
  confidence: number;
  dependency: DependencyStatus;
}

export interface PipelineDecision {
  tier: ExecutionTier;
  risk: RiskClass;
  provenance: ReviewState;
  command?: string;
  explanation: string;
  missingDependencies?: string[];
  debug: string[];
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
