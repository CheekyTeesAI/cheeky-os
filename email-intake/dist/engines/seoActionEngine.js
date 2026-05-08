"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSeoActions = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const seoAuditEngine_1 = require("./seoAuditEngine");
const generateSeoActions = async () => {
    const findings = await (0, seoAuditEngine_1.runSeoAudit)();
    const actions = findings.map((f) => ({
        type: f.type,
        description: f.description,
        impact: f.impact,
    }));
    for (const action of actions) {
        await prisma_1.default.seoAction.create({
            data: {
                type: action.type,
                description: action.description,
                impact: action.impact,
            },
        });
    }
    return actions;
};
exports.generateSeoActions = generateSeoActions;
