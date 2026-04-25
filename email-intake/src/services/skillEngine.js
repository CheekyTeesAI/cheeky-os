const fs = require("fs");
const path = require("path");

const SKILLS_FILE = path.join(__dirname, "..", "..", "ai", "skills", "skills.json");

let cachedSkills = null;
function getSkills() {
  if (cachedSkills) return cachedSkills;
  try {
    const raw = fs.readFileSync(SKILLS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    cachedSkills = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    cachedSkills = {};
  }
  return cachedSkills;
}

function selectSkill(command) {
  const msg = String(command || "").toLowerCase();
  if (!msg) return null;
  if (msg.includes("write") || msg.includes("explain")) return "scqa";
  if (msg.includes("summarize")) return "summary";
  if (msg.includes("pitch") || msg.includes("follow-up") || msg.includes("sell"))
    return "copywriting";
  if (msg.includes("call") || msg.includes("customer") || msg.includes("sales"))
    return "sales";
  if (msg.includes("plan") || msg.includes("steps") || msg.includes("workflow"))
    return "workflow";
  return null;
}

module.exports = {
  selectSkill,
  getSkills,
};
