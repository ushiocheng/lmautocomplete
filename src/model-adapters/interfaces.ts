import type { ClassifierResult, GeneratorResult, ModelEndpointConfig, NormalizedInput } from "../Interfaces/types.js";

export interface ClassifierAdapter {
    classify(input: NormalizedInput, endpoint: ModelEndpointConfig): Promise<ClassifierResult>;
}

export interface GeneratorAdapter {
    generate(input: NormalizedInput, endpoint: ModelEndpointConfig): Promise<GeneratorResult>;
}
