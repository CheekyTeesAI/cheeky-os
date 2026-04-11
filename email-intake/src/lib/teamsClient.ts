import { logger } from "../utils/logger";

export class TeamsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamsConfigError";
  }
}

export function requireTeamsWebhookUrl(): string {
  const url = String(process.env.TEAMS_WEBHOOK_URL ?? "").trim();
  if (!url) {
    throw new TeamsConfigError("TEAMS_WEBHOOK_URL is not set");
  }
  return url;
}

export async function sendTeamsWebhookMessage(text: string): Promise<void> {
  const url = requireTeamsWebhookUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) {
    logger.warn(
      `Teams webhook HTTP ${res.status}: ${body.slice(0, 400)}`
    );
    throw new Error(
      `Teams webhook failed (${res.status}): ${body.slice(0, 200)}`
    );
  }
}
