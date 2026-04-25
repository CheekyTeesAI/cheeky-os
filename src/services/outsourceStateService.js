"use strict";

const computeOutsourceStage = (job) => {
  if (!job.artReady) {
    return "NOT_READY";
  }

  if (job.artReady && job.packetStatus !== "CREATED") {
    return "ART_READY";
  }

  if (job.packetStatus === "CREATED" && !job.garmentsShippedAt) {
    return "PACKET_READY";
  }

  if (job.garmentsShippedAt && !job.garmentsDeliveredAt) {
    return "SHIPPED";
  }

  if (job.garmentsDeliveredAt && job.status !== "COMPLETE") {
    return "DELIVERED";
  }

  if (job.status === "PRINTING") {
    return "PRINTING";
  }

  if (job.status === "COMPLETE") {
    return "COMPLETE";
  }

  return "NOT_READY";
};

module.exports = { computeOutsourceStage };
