import { runChiefFullCycle } from "./full-cycle";

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ").trim();
  const result = await runChiefFullCycle(input);
  // eslint-disable-next-line no-console
  console.log("Chief full-cycle complete:", result);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Chief full-cycle failed:", err);
  process.exitCode = 1;
});
