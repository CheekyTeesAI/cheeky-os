import { appendDailyEvent, ensureDailyMemory, updateMemorySpine, upsertEntityMemory } from "./memory-engine";
import { generateEveningWrap, generateMorningBrief } from "./briefing-engine";
import { generateIntelFiles } from "./intel-engine";
import { generateWeeklyKaizen } from "./kaizen-engine";
import { extractTasksFromText, generateTaskViews, upsertMasterTasks } from "./task-engine";

export async function runChiefFullCycle(inputText = ""): Promise<{
  dailyFile: string;
  morningBrief: string;
  eveningBrief: string;
  kaizenFile: string;
}> {
  const dailyFile = await ensureDailyMemory();
  if (inputText.trim()) {
    await appendDailyEvent({
      type: "note",
      title: "Ingested input",
      detail: inputText.trim().slice(0, 500)
    });
    const tasks = extractTasksFromText(inputText, "chief-full-cycle");
    await upsertMasterTasks(tasks);
    await generateTaskViews();
  }

  await upsertEntityMemory({
    type: "relationships",
    name: "cheeky-os-operator-layer",
    summary: "Chief of Staff operating memory for commitments, risks, and execution control.",
    currentStatus: "Active",
    nextAction: "Ingest real customer/order signals and reduce mock dependence.",
    risks: ["Insufficient source data can cause weak prioritization."]
  });

  await updateMemorySpine();
  await generateIntelFiles();
  const morningBrief = await generateMorningBrief();
  const eveningBrief = await generateEveningWrap();
  const kaizenFile = await generateWeeklyKaizen();

  return { dailyFile, morningBrief, eveningBrief, kaizenFile };
}
