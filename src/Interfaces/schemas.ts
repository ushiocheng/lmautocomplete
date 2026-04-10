import { z } from "zod";
import { ReviewState, RiskClass } from "./types.js";

export const classifierResultSchema = z.object({
    intent: z.string().nullable(),
    slots: z.record(z.string()),
    confidence: z.number().min(0).max(1),
    needs_fallback: z.boolean(),
});

// Same as above, but in JSON Schema format for OpenAI endpoint
export const classifierResultJsonSchema = {
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
};

export const generatorResultSchema = z.object({
    template: z.object({
        intent: z.string().min(1),
        summary: z.string().min(1),
        slots: z.array(z.string()),
        template: z.string().min(1),
        depends_on: z.array(z.string()),
    }),
    command_preview: z.string().min(1),
    explanation: z.string().min(1),
    confidence: z.number().min(0).max(1),
});

export const generatorResultJsonSchema = {
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
};

const platformKey = z.enum(["linux", "macos"]);

export const templateEntrySchema = z.object({
    intent: z.string().min(1),
    summary: z.string().min(1),
    slots: z.array(z.string()),
    template_by_platform: z.record(platformKey, z.string().min(1)),
    depends_on: z.record(platformKey, z.array(z.string().min(1))),
    risk: z.union([
        z.literal(RiskClass.Safe),
        z.literal(RiskClass.SemiSafe),
        z.literal(RiskClass.Mutating),
        z.literal(RiskClass.Privileged),
        z.literal(RiskClass.Destructive),
        z.literal(RiskClass.Unknown),
    ]),
    review_state: z.union([
        z.literal(ReviewState.OwnerReviewed),
        z.literal(ReviewState.CommunityReviewed),
        z.literal(ReviewState.Unreviewed),
        z.literal(ReviewState.Generated),
    ]),
});
