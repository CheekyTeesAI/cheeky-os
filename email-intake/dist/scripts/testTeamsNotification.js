"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const teamsNotificationService_1 = require("../services/teamsNotificationService");
async function main() {
    const orderId = process.argv[2];
    if (!orderId) {
        console.error("Usage: npx ts-node src/scripts/testTeamsNotification.ts <orderId>");
        process.exitCode = 1;
        return;
    }
    console.log("notifyNewIntake:", await (0, teamsNotificationService_1.notifyNewIntake)(orderId));
    console.log("notifyBlockedOrder:", await (0, teamsNotificationService_1.notifyBlockedOrder)(orderId));
    console.log("notifyDepositReceived:", await (0, teamsNotificationService_1.notifyDepositReceived)(orderId));
    console.log("notifyProductionReady:", await (0, teamsNotificationService_1.notifyProductionReady)(orderId));
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
