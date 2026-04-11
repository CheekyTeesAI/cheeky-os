import { brain } from "../core/brain";
import { gatekeeper } from "../core/gatekeeper";
import { route } from "../core/router";
import { sendEmail } from "../services/email.service";
import type { VoiceInvoiceSuccess } from "./sales.engine";

export type IntakeResult = VoiceInvoiceSuccess;

/**
 * Email-style intake: raw text → brain → gatekeeper → router → confirmation email.
 */
export async function runIntakeFromEmailText(
  rawText: string,
  notifyTo: string
): Promise<IntakeResult> {
  const brainOut = await brain(rawText);
  const gk = gatekeeper(brainOut);
  if (gk.ok === false) {
    throw new Error(gk.error);
  }
  const routed = await route(brainOut.intent, gk.payload);
  await sendEmail(
    notifyTo,
    "Your Cheeky Tees Invoice",
    `Your order has been processed. Invoice ID: ${routed.invoiceId}`
  );
  return routed;
}
