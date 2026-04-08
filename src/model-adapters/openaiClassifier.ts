import { classifierResultSchema } from "../models/schemas.js";
import { printFunctionCall, printIfDebug } from "../core/debug.js";
import type { ClassifierAdapter } from "./interfaces.js";
import type { ClassifierResult, ModelEndpointConfig, NormalizedInput } from "../models/types.js";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const classifierJsonSchema = {
  name: "classifier_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: { type: ["string", "null"] },
      slots: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      confidence: { type: "number" },
      needs_fallback: { type: "boolean" },
    },
    required: ["intent", "slots", "confidence", "needs_fallback"],
    additionalProperties: false,
  },
} as const;

export class OpenAIClassifierAdapter implements ClassifierAdapter {
  async classify(input: NormalizedInput, endpoint: ModelEndpointConfig): Promise<ClassifierResult> {
    printFunctionCall("modelAdapters.openaiClassifier.classify", {
      endpointEnabled: endpoint.enabled,
      hasBaseUrl: Boolean(endpoint.baseUrl),
      hasModel: Boolean(endpoint.model),
    });
    if (!endpoint.enabled || !endpoint.baseUrl || !endpoint.model) {
      return {
        intent: null,
        slots: {},
        confidence: 0,
        needs_fallback: true,
      };
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
            json_schema: classifierJsonSchema,
          },
          messages: [
            {
              role: "system",
              content:
                "Classify user shell intent and slots. Return JSON only: {intent:string|null,slots:object,confidence:number,needs_fallback:boolean}. Never return shell command.",
            },
            {
              role: "user",
              content: JSON.stringify({ instruction: input.normalized, candidates: input.candidates }),
            },
          ],
          temperature: 0,
          stream: false,
        }),
      });

      if (!response.ok) {
        printIfDebug("modelAdapters.openaiClassifier", `response not ok: ${response.status} ${response.statusText}`);
        return {
          intent: null,
          slots: {},
          confidence: 0,
          needs_fallback: true,
        };
      }

      const payload = (await response.json()) as OpenAIResponse;
      const content = payload.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      printIfDebug("modelAdapters.openaiClassifier", "response content", content);
      return classifierResultSchema.parse(parsed);
    } catch {
      return {
        intent: null,
        slots: {},
        confidence: 0,
        needs_fallback: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
