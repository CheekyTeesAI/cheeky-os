/**
 * Timeline view for communications tied to a job, intake, invoice, etc.
 */
const { getCommunicationsByRelated } = require("./communicationService");

function getRelatedCommunicationTimeline(relatedType, relatedId) {
  const rt = String(relatedType || "").toUpperCase();
  const rid = String(relatedId || "").trim();
  const rows = getCommunicationsByRelated(rt, rid);
  const timeline = rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    templateKey: r.templateKey,
    status: r.status,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
    subject: r.subject,
    previewOnly: String(r.status || "").toUpperCase() === "PREVIEW",
    error: r.error || null,
    provider: r.provider || null,
  }));
  return {
    relatedType: rt,
    relatedId: rid,
    timeline,
  };
}

module.exports = {
  getRelatedCommunicationTimeline,
};
