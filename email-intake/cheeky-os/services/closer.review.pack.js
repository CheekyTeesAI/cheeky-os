"use strict";

/**
 * Single place to build one closer review object from an inbound message.
 * Used by HTTP closer route, operator aggregate, and quote-draft bridge.
 */

const closerClassifier   = require("./closer.classifier.service");
const orderExtractor    = require("./order.extractor.service");
const closerNextAction   = require("./closer.next-action.service");
const closerReply        = require("./closer.reply.service");
const closerTask         = require("./closer.task.service");
const closerOrderDraft   = require("./closer.order-draft.service");
const { buildCanonicalReply } = require("./reply.draft.canonical.service");

function buildCloserReviewForMessage(message) {
  const classification = closerClassifier.classifyMessage(message);
  const orderDetails = orderExtractor.extractOrderDetails(message);
  const nextAction = closerNextAction.getNextAction({ classification, orderDetails });
  const replyDraft = closerReply.buildReplyDraft({
    message,
    classification,
    orderDetails,
    nextAction,
  });
  const taskDraft = closerTask.buildTaskDraft({
    message,
    classification,
    orderDetails,
    nextAction,
  });
  const orderDraft = closerOrderDraft.buildOrderDraft({
    message,
    classification,
    orderDetails,
  });

  const depositOpportunity =
    classification === "payment_ready" ||
    classification === "quote_request" ||
    classification === "order_interest";

  const inboundAiReplyDraft = message.aiReplyDraft || null;

  const canonicalReplyDraft = buildCanonicalReply({
    classification,
    closerReplyDraft: replyDraft,
    inboundAiReplyDraft,
  });

  return {
    inboundId: message.id,
    classification,
    orderDetails,
    nextAction,
    replyDraft,
    taskDraft,
    orderDraft,
    canonicalReplyDraft,
    depositOpportunity,
    requiresReview: true,
  };
}

module.exports = { buildCloserReviewForMessage };
