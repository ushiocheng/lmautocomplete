import type { NormalizedInput } from "../Interfaces/types.js";
import { printFunctionCall } from "./debug.js";

export function normalizeInput(raw: string): NormalizedInput {
    printFunctionCall("core.normalize.normalizeInput", { raw });

    const quotedTokens = [...raw.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");

    // console.log({ quotedTokens, normalized });
    return {
        raw,
        normalized,
        quotedTokens,
    };
}
