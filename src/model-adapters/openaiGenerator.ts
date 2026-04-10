import { generatorResultSchema, generatorResultJsonSchema } from "../Interfaces/schemas.js";
import { printFunctionCall, printIfDebug } from "../core/debug.js";
import type { GeneratorAdapter } from "./interfaces.js";
import type { GeneratorResult, ModelEndpointConfig, NormalizedInput } from "../Interfaces/types.js";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

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
    const timeout = setTimeout(() => {
      console.log("[WARN] OAI Generator request timed out.");
      controller.abort();
    }, endpoint.timeoutMs);

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
            json_schema: generatorResultJsonSchema,
          },
          messages: [
            {
              role: "system",
              content:
                "Propose a shell template draft for the task. Return JSON only with shape {template:{intent:string,summary:string,slots:string[],template:string,depends_on:string[]},command_preview:string,explanation:string,confidence:number}. command_preview should be a concrete command for display. template should use {slot} placeholders when relevant. Do not include markdown.",
            },
            {
              role: "user",
              content: JSON.stringify({
                instruction: input.normalized,
                quoted_tokens: input.quotedTokens,
              }),
            },
          ],
          temperature: 0.2,
          stream: false,
        }),
      });

      if (!(await response).ok) {
        printIfDebug("modelAdapters.openaiGenerator", `response not ok: ${response.status} ${response.statusText}`);
        throw new Error(`Generator endpoint request failed: ${response.status}`);
      }

      const payload = (await response.json()) as OpenAIResponse;
      printIfDebug("modelAdapters.openaiGenerator", "response received", payload);
      const content = payload.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      printIfDebug("modelAdapters.openaiGenerator", "response content", parsed);
      return generatorResultSchema.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }
}
