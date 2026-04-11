import { BrainOutput } from "../types";
import { ValidatedInvoicePayload } from "./gatekeeper";
import { runCreateInvoice, VoiceInvoiceSuccess } from "../engines/sales.engine";

/**
 * Routes validated brain intent to the appropriate engine.
 */
export async function route(
  intent: BrainOutput["intent"],
  payload: ValidatedInvoicePayload
): Promise<VoiceInvoiceSuccess> {
  switch (intent) {
    case "CREATE_INVOICE":
      return runCreateInvoice(payload);
    default:
      throw new Error(`Unsupported intent: ${intent}`);
  }
}
