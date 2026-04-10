import { classifierResultSchema, classifierResultJsonSchema } from "../Interfaces/schemas.js";
import { printFunctionCall, printIfDebug } from "../core/debug.js";
import type { ClassifierAdapter } from "./interfaces.js";
import type { ClassifierResult, ModelEndpointConfig, NormalizedInput } from "../Interfaces/types.js";
import { loadTemplates } from "../db/loader.js";

interface OpenAIResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

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
        const timeout = setTimeout(() => {
            console.log("[WARN] OAI Classifier request timed out.");
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
                        json_schema: classifierResultJsonSchema,
                    },
                    messages: [
                        {
                            role: "system",
                            content:
                                "Classify user shell intent and quoted or unquoted tokens as template arguments aka slots. Return JSON only. Never return shell command.",
                        },
                        {
                            role: "user",
                            content: JSON.stringify({
                                instruction: input.normalized,
                                quoted_tokens: input.quotedTokens,
                            }),
                        },
                        {
                            role: "system",
                            content: `Available Intents: ${(await loadTemplates()).map((t) => t.intent).join(", ")}`,
                        },
                    ],
                    temperature: 0,
                    stream: false,
                }),
            });

            if (!(await response).ok) {
                printIfDebug(
                    "modelAdapters.openaiClassifier",
                    `response not ok: ${response.status} ${response.statusText}`
                );
                return {
                    intent: null,
                    slots: {},
                    confidence: 0,
                    needs_fallback: true,
                };
            }

            const payload = (await response.json()) as OpenAIResponse;
            try {
                const content = payload.choices?.[0]?.message?.content ?? "{}";
                const parsed = JSON.parse(content);
                printIfDebug("modelAdapters.openaiClassifier", "response content", parsed);
                return classifierResultSchema.parse(parsed);
            } catch (err) {
                console.error("[ERROR] Error parsing classifier response:", err);
                // Only print full packet if parsing failed
                printIfDebug("modelAdapters.openaiClassifier", "response received", payload);
                throw err;
            }
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
