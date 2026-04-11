"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const full_cycle_1 = require("./full-cycle");
async function main() {
    const input = process.argv.slice(2).join(" ").trim();
    const result = await (0, full_cycle_1.runChiefFullCycle)(input);
    // eslint-disable-next-line no-console
    console.log("Chief full-cycle complete:", result);
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Chief full-cycle failed:", err);
    process.exitCode = 1;
});
