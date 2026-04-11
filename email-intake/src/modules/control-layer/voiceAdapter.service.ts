function stripFiller(input: string): string {
  const fillers = ["hey", "okay", "ok", "um", "uh", "can you", "please"];
  let out = input.toLowerCase();
  for (const f of fillers) {
    const rx = new RegExp(`\\b${f.replace(/\s+/g, "\\s+")}\\b`, "g");
    out = out.replace(rx, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function mapCasualPhrasing(input: string): string {
  if (input.includes("what should i do right now")) return "next actions";
  if (input.includes("run the shop")) return "run business";
  if (input.includes("follow up everyone")) return "follow up leads";
  return input;
}

export function normalizeVoiceInput(message: string): string {
  const stripped = stripFiller(message);
  return mapCasualPhrasing(stripped);
}
