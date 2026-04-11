/**
 * Barrel path for operator/route safety checks (implementation lives in safetyGuard.service).
 *
 * Example:
 *   import { evaluateOperationSafety } from "./safetyGuardService";
 *   const gate = evaluateOperationSafety({ operation: "myOp", requestedLimit: n });
 *   if (!gate.allowed) return res.status(400).json({ error: gate.reason });
 */
export {
  evaluateOperationSafety,
  type OperationSafetyIntent,
  type SafetyDecision,
} from "./safetyGuard.service";
