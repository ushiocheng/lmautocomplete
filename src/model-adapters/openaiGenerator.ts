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
                                "Propose a generalized shell command template for the task. Return JSON only with shape {template:{intent:string,summary:string,slots:string[],template:string,depends_on:string[]},slotGuesses:Record<string, string>}.\nRequirements: \n- The command template should use {slot} placeholders.\n- Provide guesses for the value of each slot based on the user instruction and put them in slotGuesses as a KV map.\n- Any executables referenced should be named in depends_on.\n- Do not include markdown. Be concise whenever possible.",
                        },
                        {
                            role: "user",
                            content: `Instruction: ${input.raw}`,
                        },
                    ],
                    temperature: 0.2,
                    stream: false,
                }),
            });

            if (!response.ok) {
                printIfDebug(
                    "modelAdapters.openaiGenerator",
                    `response not ok: ${response.status} ${response.statusText}`
                );
                throw new Error(`Generator endpoint request failed: ${response.status}`);
            }

            const payload = (await response.json()) as OpenAIResponse;
            try {
                const content = payload.choices?.[0]?.message?.content ?? "{}";
                const parsed = JSON.parse(content);
                printIfDebug("modelAdapters.openaiGenerator", "response content", parsed);
                return generatorResultSchema.parse(parsed);
            } catch (err) {
                console.error("[ERROR] Error parsing generator response:", err);
                // Only print full packet if parsing failed
                printIfDebug("modelAdapters.openaiGenerator", "response received", payload);
                throw err;
            }
        } finally {
            clearTimeout(timeout);
        }
    }
}
