"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyReport = sendDailyReport;
exports.startScheduler = startScheduler;
const nodemailer_1 = __importDefault(require("nodemailer"));
const operator_controller_1 = require("../controllers/operator.controller");
const eventEngine_service_1 = require("./eventEngine.service");
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
let schedulerStarted = false;
let smtpTransport = null;
function getSmtpTransport() {
    if (smtpTransport)
        return smtpTransport;
    const host = (process.env.EMAIL_HOST || "").trim();
    const port = Number(process.env.EMAIL_PORT || 587);
    const user = (process.env.EMAIL_USER || "").trim();
    const pass = (process.env.EMAIL_PASS || "").trim();
    if (!host || !port || !user || !pass) {
        throw new Error("SMTP config missing (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)");
    }
    smtpTransport = nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
    return smtpTransport;
}
async function sendDailyReport(data) {
    const out = typeof data === "object" && data !== null ? data : {};
    const priorityDeals = Array.isArray(out.priorityDeals) ? out.priorityDeals : [];
    const actions = Array.isArray(out.actions) ? out.actions : [];
    const followups = typeof out.followups === "object" && out.followups !== null
        ? out.followups
        : {};
    const sent = typeof followups.sent === "number" ? followups.sent : 0;
    const topDealsText = priorityDeals
        .map((d) => {
        const row = typeof d === "object" && d !== null ? d : {};
        return `- ${String(row.name || "Deal")} ($${Number(row.value || 0)})`;
    })
        .join("\n");
    const actionsText = actions.map((a) => `- ${String(a)}`).join("\n");
    const body = [
        "Top Deals:",
        topDealsText || "- none",
        "",
        "Actions:",
        actionsText || "- none",
        "",
        `Follow-ups: ${sent}`
    ].join("\n");
    const transport = getSmtpTransport();
    const from = (process.env.EMAIL_USER || "").trim();
    const to = (process.env.DAILY_REPORT_EMAIL || process.env.EMAIL_USER || "").trim();
    if (!from || !to) {
        throw new Error("Missing report sender/recipient email");
    }
    await transport.sendMail({
        from,
        to,
        subject: "Cheeky Daily War Room",
        text: body
    });
}
async function runScheduledDay() {
    let payload = {};
    const fakeReq = {};
    const fakeRes = {
        status: (_code) => fakeRes,
        json: (body) => {
            payload = body;
            return fakeRes;
        }
    };
    await (0, operator_controller_1.runDay)(fakeReq, fakeRes);
    const envelope = typeof payload === "object" && payload !== null ? payload : {};
    const data = envelope.data;
    await sendDailyReport(data);
}
function startScheduler() {
    if (schedulerStarted)
        return;
    schedulerStarted = true;
    setInterval(() => {
        (0, eventEngine_service_1.checkEvents)().catch((err) => {
            console.error("Hourly event engine error:", err);
        });
    }, HOUR_MS);
    setInterval(() => {
        runScheduledDay().catch((err) => {
            console.error("Daily scheduler error:", err);
        });
    }, DAY_MS);
}
