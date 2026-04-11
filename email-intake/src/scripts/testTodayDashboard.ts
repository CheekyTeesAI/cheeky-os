import "dotenv/config";
import { getTodayDashboard } from "../services/dashboardService";

async function main() {
  const result = await getTodayDashboard();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
