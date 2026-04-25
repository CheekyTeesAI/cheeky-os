const { addTimelineEvent } = require("./timelineService");
const { logInbound } = require("./inboundOpsLog");

/**
 * @param {{ relatedType: string, relatedId: string, note: string, author?: string }} p
 */
function addManualNote(p) {
  const relatedType = String((p && p.relatedType) || "GENERAL").toUpperCase();
  const relatedId = String((p && p.relatedId) || "").trim();
  const note = String((p && p.note) || "").slice(0, 8000);
  const author = String((p && p.author) || "USER").trim();
  const ev = addTimelineEvent({
    relatedType,
    relatedId,
    channel: "MANUAL",
    eventType: "MANUAL_NOTE",
    title: "Note",
    summary: note,
    createdByType: "USER",
    createdById: author,
    metadata: { author },
  });
  logInbound("manual_note_added", { timelineId: ev.id, relatedType, relatedId });
  return ev;
}

module.exports = { addManualNote };
