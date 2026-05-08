"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAllEngines = void 0;
const seoActionEngine_1 = require("./seoActionEngine");
const runAllEngines = async () => {
    console.log("Running SEO Engine...");
    const actions = await (0, seoActionEngine_1.generateSeoActions)();
    console.log("SEO Actions Generated:", actions.length);
    return {
        actionsGenerated: actions.length,
    };
};
exports.runAllEngines = runAllEngines;
