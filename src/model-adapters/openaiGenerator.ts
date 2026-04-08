import { generatorResultSchema } from "../models/schemas.js";
import { printFunctionCall } from "../core/debug.js";
import type { GeneratorAdapter } from "./interfaces.js";
import type { GeneratorResult, ModelEndpointConfig, NormalizedInput } from "../models/types.js";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const generatorJsonSchema = {
  name: "generator_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      template: {
        type: "object",
        properties: {
          intent: { type: "string" },
          summary: { type: "string" },
          slots: {
            type: "array",
            items: { type: "string" },
          },
          template: { type: "string" },
          depends_on: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["intent", "summary", "slots", "template", "depends_on"],
        additionalProperties: false,
      },
      command_preview: { type: "string" },
      explanation: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["template", "command_preview", "explanation", "confidence"],
    additionalProperties: false,
  },
} as const;

export class OpenAIGeneratorAdapter implements GeneratorAdapter {
  async generate(input: NormalizedInput, endpoint: ModelEndpointConfig): Promise<GeneratorResult> {
    printFunctionCall("modelAdapters.openaiGenerator.generate", {
      endpointEnabled: endpoint.enabled,
      hasBaseUrl: Boolean(endpoint.baseUrl),
      hasModel: Boolean(endpoint.model),
    });
    if (!endpoint.enabled || !endpoint.baseUrl || !endpoint.model) {
      throw new Error("Generator endpoint is not configured.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);

    try {
      const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: endpoint.model,
          response_format: {
            type: "json_schema",
            json_schema: generatorJsonSchema,
          },
          messages: [
            {
              role: "system",
              content:
                "Propose a shell template draft for the task. Return JSON only with shape {template:{intent:string,summary:string,slots:string[],template:string,depends_on:string[]},command_preview:string,explanation:string,confidence:number}. command_preview should be a concrete command for display. template should use {slot} placeholders when relevant. Do not include markdown.",
            },
            {
              role: "user",
              content: JSON.stringify({ instruction: input.normalized, candidates: input.candidates }),
            },
          ],
          temperature: 0.2,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Generator endpoint request failed: ${response.status}`);
      }

      const payload = (await response.json()) as OpenAIResponse;
      const content = payload.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      return generatorResultSchema.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }
}
