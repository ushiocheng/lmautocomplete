import type { ClassifierResult, NormalizedInput } from "../models/types.js";
import { printFunctionCall } from "./debug.js";

export function classifyHeuristically(input: NormalizedInput): ClassifierResult | null {
  printFunctionCall("core.heuristics.classifyHeuristically", { normalized: input.normalized });
  const n = input.normalized;

  if (/\b(port|listening|what uses port|which process)\b/.test(n)) {
    return {
      intent: "check_port",
      slots: input.candidates.port ? { port: input.candidates.port } : {},
      confidence: input.candidates.port ? 0.97 : 0.87,
      needs_fallback: false,
    };
  }

  if (/\bdocker\s+group\b/.test(n) || /\badd\s+.*\s+to\s+docker\b/.test(n)) {
    return {
      intent: "add_user_to_docker_group",
      slots: input.candidates.user ? { user: input.candidates.user } : {},
      confidence: input.candidates.user ? 0.96 : 0.88,
      needs_fallback: false,
    };
  }

  return null;
}
