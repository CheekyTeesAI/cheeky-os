"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../utils/logger");
/**
 * Sends email via SMTP when configured; otherwise logs to console (dev fallback).
 * Used for invoice confirmations and scheduled follow-up reminders.
 */
async function sendEmail(to, subject, body) {
    const host = (process.env.SMTP_HOST || "").trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const user = (process.env.SMTP_USER || "").trim();
    const pass = (process.env.SMTP_PASS || "").trim();
    const from = (process.env.SMTP_FROM || user || "cheeky@localhost").trim();
    if (!host) {
        logger_1.logger.info(`[EMAIL] (console fallback) to=${to} subject=${subject} body=${body.replace(/\s+/g, " ").slice(0, 200)}...`);
        return;
    }
    const transporter = nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined
    });
    await transporter.sendMail({
        from,
        to,
        subject,
        text: body
    });
    logger_1.logger.info(`[EMAIL] sent to=${to} subject=${subject}`);
}
