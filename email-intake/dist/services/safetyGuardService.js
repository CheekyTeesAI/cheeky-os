"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateOperationSafety = void 0;
/**
 * Barrel path for operator/route safety checks (implementation lives in safetyGuard.service).
 *
 * Example:
 *   import { evaluateOperationSafety } from "./safetyGuardService";
 *   const gate = evaluateOperationSafety({ operation: "myOp", requestedLimit: n });
 *   if (!gate.allowed) return res.status(400).json({ error: gate.reason });
 */
var safetyGuard_service_1 = require("./safetyGuard.service");
Object.defineProperty(exports, "evaluateOperationSafety", { enumerable: true, get: function () { return safetyGuard_service_1.evaluateOperationSafety; } });
