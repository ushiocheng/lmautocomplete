import type { NormalizedInput } from "../models/types.js";
import { printFunctionCall } from "./debug.js";

export function normalizeInput(raw: string): NormalizedInput {
  printFunctionCall("core.normalize.normalizeInput", { raw });
  const quotedTokens = [...raw.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const tokens = normalized.split(" ").filter(Boolean);

  const candidates: Record<string, string> = {};
  const portMatch = normalized.match(/\bport\s+(\d{1,5})\b/) ?? normalized.match(/\b(\d{2,5})\b/);
  if (portMatch?.[1]) {
    candidates.port = portMatch[1];
  }

  const serviceMatch = normalized.match(/\bservice\s+([a-z0-9._-]+)\b/);
  if (serviceMatch?.[1]) {
    candidates.service = serviceMatch[1];
  }

  const userMatch = normalized.match(/\buser\s+([a-z_][a-z0-9_-]*)\b/) ?? normalized.match(/\badd\s+([a-z_][a-z0-9_-]*)\s+to\b/);
  if (userMatch?.[1]) {
    candidates.user = userMatch[1];
  }

  const groupMatch = normalized.match(/\bgroup\s+([a-z_][a-z0-9_-]*)\b/);
  if (groupMatch?.[1]) {
    candidates.group = groupMatch[1];
  }

  return {
    raw,
    normalized,
    tokens,
    quotedTokens,
    candidates,
  };
}
