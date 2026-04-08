import { ExecutionTier, ReviewState, RiskClass } from "../models/types.js";
import { printFunctionCall } from "./debug.js";

export function resolveExecutionTier(risk: RiskClass, provenance: ReviewState): ExecutionTier {
  printFunctionCall("core.trust.resolveExecutionTier", { risk, provenance });
  if (provenance === ReviewState.Generated) {
    return ExecutionTier.T3;
  }

  if (provenance === ReviewState.OwnerReviewed && risk === RiskClass.Safe) {
    return ExecutionTier.T0;
  }

  if (
    provenance === ReviewState.OwnerReviewed &&
    (risk === RiskClass.SemiSafe || risk === RiskClass.Mutating || risk === RiskClass.Privileged)
  ) {
    return ExecutionTier.T1;
  }

  return ExecutionTier.T2;
}
