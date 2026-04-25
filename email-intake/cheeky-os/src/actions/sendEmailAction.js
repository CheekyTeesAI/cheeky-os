"use strict";

const nodemailer = require("nodemailer");
const policyEngine = require("../operator/policyEngine");
const actionAudit = require("../operator/actionAudit");

module.exports = async function sendEmailAction({ to, subject, message }) {
  try {
    const source = arguments[0] && arguments[0].source ? String(arguments[0].source) : "";
    const followupType = arguments[0] && arguments[0].followupType ? String(arguments[0].followupType) : "";
    const entityId = arguments[0] && arguments[0].entityId ? String(arguments[0].entityId) : "";
    if (source === "FOLLOWUP_AUTOMATION") {
      const autoSend = String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true";
      const approvedType = followupType === "DEPOSIT_FOLLOWUP" || followupType === "STALE_QUOTE_NUDGE";
      if (!autoSend || !approvedType || !entityId) {
        console.log("[AUTOPILOT] BLOCKED — EXTERNAL ACTION NOT ALLOWED IN CONTROLLED MODE");
        actionAudit({
          type: "FOLLOWUP_SEND_BLOCKED",
          to,
          subject,
          followupType,
          entityId,
          reason: !autoSend ? "FOLLOWUP_AUTO_SEND=false" : (!approvedType ? "unsupported_type" : "missing_entity_link"),
        });
        return { success: false, blocked: true, message: "Follow-up send blocked by safety policy" };
      }
    }

    const policy = policyEngine({
      action: "SEND_EMAIL",
      data: { to, subject, message },
    });

    if (policy.blocked) {
      actionAudit({
        type: "SEND_EMAIL_BLOCKED",
        to,
        subject,
        reasons: policy.reasons,
      });

      return {
        success: false,
        blocked: true,
        reasons: policy.reasons,
      };
    }

    if (!to || !message) {
      return { success: false, message: "Missing email or message" };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return {
        success: false,
        message: "Email not configured (set EMAIL_USER and EMAIL_PASS)",
      };
    }

    // TRANSPORT (GMAIL OR SMTP)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Cheeky Tees" <${process.env.EMAIL_USER}>`,
      to,
      subject: subject || "Quick follow up",
      text: message,
    });

    console.log("[EMAIL SENT]", to);
    actionAudit({
      type: "SEND_EMAIL_SUCCESS",
      to,
      subject,
      messageId: info.messageId,
    });

    return {
      success: true,
      message: "Email sent",
      to,
      messageId: info && info.messageId ? info.messageId : null,
    };
  } catch (err) {
    actionAudit({
      type: "SEND_EMAIL_ERROR",
      to,
      subject,
      error: err && err.message ? err.message : String(err),
    });
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
