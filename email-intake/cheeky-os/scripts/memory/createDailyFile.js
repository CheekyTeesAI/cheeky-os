const fs = require("fs");
const path = require("path");

function toIsoDateUtc(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function resolveDate(date) {
  if (date) return String(date);
  return toIsoDateUtc(new Date());
}

function buildTemplate(dateStr, isoNow) {
  return `---
type: daily
id: ${dateStr}
created: ${isoNow}
updated: ${isoNow}
status: active
tags: []
---

## Morning Priorities

## Events Log

## Promises Made

## Cash Moves

## Risks Surfaced

## Evening Wrap

---
`;
}

function createDailyFile(date) {
  const dateStr = resolveDate(date);
  const dailyDir = path.join(__dirname, "../../memory/daily");
  const filePath = path.join(dailyDir, `${dateStr}.md`);

  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    return {
      created: false,
      path: filePath
    };
  }

  const isoNow = new Date().toISOString();
  const content = buildTemplate(dateStr, isoNow);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`[MEMORY] Created daily file ${dateStr}`);

  return {
    created: true,
    path: filePath
  };
}

module.exports = createDailyFile;

if (require.main === module) {
  const result = createDailyFile();
  console.log(result);
}
