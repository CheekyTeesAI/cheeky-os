"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIntakeFromEmailText = runIntakeFromEmailText;
const brain_1 = require("../core/brain");
const gatekeeper_1 = require("../core/gatekeeper");
const router_1 = require("../core/router");
const email_service_1 = require("../services/email.service");
/**
 * Email-style intake: raw text → brain → gatekeeper → router → confirmation email.
 */
async function runIntakeFromEmailText(rawText, notifyTo) {
    const brainOut = await (0, brain_1.brain)(rawText);
    const gk = (0, gatekeeper_1.gatekeeper)(brainOut);
    if (gk.ok === false) {
        throw new Error(gk.error);
    }
    const routed = await (0, router_1.route)(brainOut.intent, gk.payload);
    await (0, email_service_1.sendEmail)(notifyTo, "Your Cheeky Tees Invoice", `Your order has been processed. Invoice ID: ${routed.invoiceId}`);
    return routed;
}
