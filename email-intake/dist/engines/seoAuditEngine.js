"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeoAudit = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const seoService_1 = require("../services/seo/seoService");
const runSeoAudit = async () => {
    const context = (0, seoService_1.getSeoContext)();
    const competitors = await prisma_1.default.seoCompetitor.findMany();
    const findings = [];
    if (competitors.length < 3) {
        findings.push({
            type: "COMPETITOR_GAP",
            description: "Not enough competitors tracked",
            impact: "HIGH",
        });
    }
    if (context.seoGoals.targetKeywords.length < 5) {
        findings.push({
            type: "KEYWORD_GAP",
            description: "Not enough target keywords defined",
            impact: "MEDIUM",
        });
    }
    return findings;
};
exports.runSeoAudit = runSeoAudit;
