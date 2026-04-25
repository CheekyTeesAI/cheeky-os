/**
 * Unified inbound entry — dispatches to email / phone / upload handlers.
 */
const { ingestInboundEmail } = require("./emailInboxService");
const { ingestInboundSMS, ingestInboundCall } = require("./phoneOpsService");
const { attachArtToIntakeOrJob } = require("./artOpsService");
const { addTimelineEvent } = require("./timelineService");
const { logInbound } = require("./inboundOpsLog");

/**
 * @param {{ channel: string, payload?: object }} event
 */
function processInboundEvent(event) {
  const ch = String((event && event.channel) || "").toUpperCase();
  const payload = event && event.payload && typeof event.payload === "object" ? event.payload : {};

  if (ch === "EMAIL") {
    const out = ingestInboundEmail(payload);
    logInbound("inbound_processed", { channel: ch, ok: out.ok });
    return {
      channel: "EMAIL",
      createdIntakeId: out.createdIntakeId || null,
      createdServiceDeskId: out.createdServiceDeskId || null,
      matchedCustomerId: out.customerId || null,
      matchedJobId: out.match && out.match.matchedType === "JOB" ? out.match.matchedId : null,
      artDetected: out.artDetected,
      reviewRequired: out.reviewRequired,
      timelineEventIds: out.timelineEventIds || [],
      raw: out,
    };
  }

  if (ch === "SMS") {
    const out = ingestInboundSMS(payload);
    return {
      channel: "SMS",
      createdIntakeId: null,
      createdServiceDeskId: out.serviceDeskId || null,
      matchedCustomerId: out.customerId || null,
      matchedJobId: null,
      artDetected: false,
      reviewRequired: true,
      timelineEventIds: [],
      raw: out,
    };
  }

  if (ch === "VOICE" || ch === "CALL") {
    const out = ingestInboundCall(payload);
    return {
      channel: "VOICE",
      createdIntakeId: null,
      createdServiceDeskId: out.serviceDeskId || null,
      matchedCustomerId: out.customerId || null,
      matchedJobId: null,
      artDetected: false,
      reviewRequired: true,
      timelineEventIds: [],
      raw: out,
    };
  }

  if (ch === "MANUAL_UPLOAD") {
    const entityType = String(payload.relatedType || "JOB").toUpperCase();
    const entityId = String(payload.relatedId || "").trim();
    const file = {
      filename: payload.filename,
      path: payload.path,
      mimeType: payload.mimeType || payload.contentType,
      source: "MANUAL",
    };
    const art = attachArtToIntakeOrJob(entityType, entityId, file);
    const tl = addTimelineEvent({
      relatedType: entityType,
      relatedId: entityId,
      channel: "UPLOAD",
      eventType: "MANUAL_UPLOAD",
      title: "Manual art upload",
      summary: file.filename,
      rawRefId: art.id,
      metadata: { artFileId: art.id },
    });
    return {
      channel: "MANUAL_UPLOAD",
      createdIntakeId: null,
      createdServiceDeskId: null,
      matchedCustomerId: null,
      matchedJobId: entityType === "JOB" ? entityId : null,
      artDetected: true,
      reviewRequired: false,
      timelineEventIds: [tl.id],
      raw: { art },
    };
  }

  return {
    channel: ch || "UNKNOWN",
    createdIntakeId: null,
    createdServiceDeskId: null,
    matchedCustomerId: null,
    matchedJobId: null,
    artDetected: false,
    reviewRequired: true,
    timelineEventIds: [],
    error: "unsupported_channel",
  };
}

module.exports = { processInboundEvent };
