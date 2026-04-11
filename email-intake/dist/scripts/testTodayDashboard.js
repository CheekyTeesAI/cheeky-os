"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const dashboardService_1 = require("../services/dashboardService");
async function main() {
    const result = await (0, dashboardService_1.getTodayDashboard)();
    console.log(JSON.stringify(result, null, 2));
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
