import "dotenv/config";
import {
  notifyBlockedOrder,
  notifyDepositReceived,
  notifyNewIntake,
  notifyProductionReady,
} from "../services/teamsNotificationService";

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npx ts-node src/scripts/testTeamsNotification.ts <orderId>");
    process.exitCode = 1;
    return;
  }

  console.log("notifyNewIntake:", await notifyNewIntake(orderId));
  console.log("notifyBlockedOrder:", await notifyBlockedOrder(orderId));
  console.log("notifyDepositReceived:", await notifyDepositReceived(orderId));
  console.log("notifyProductionReady:", await notifyProductionReady(orderId));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
