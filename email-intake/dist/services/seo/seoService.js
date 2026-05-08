"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSeoContext = getSeoContext;
function getSeoContext() {
    const raw = process.env.SEO_TARGET_KEYWORDS || "";
    const targetKeywords = raw
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    return {
        seoGoals: {
            targetKeywords,
        },
    };
}
