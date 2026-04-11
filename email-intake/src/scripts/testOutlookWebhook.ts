import "dotenv/config";
import { parseEmailIntake } from "../services/emailIntakeParser";
import {
  executeEmailIntakePipeline,
  findDuplicateOutlookIntake,
} from "../services/emailIntakeOrderService";

const sample = {
  fromName: "Power Automate Test",
  fromEmail: "pa-test@example.com",
  subject: "Order via Outlook bridge",
  body: "We need 12 crewneck sweatshirts, screen print front. Thanks!",
  messageId: `test-outlook-msg-${Date.now()}`,
  receivedAt: new Date().toISOString(),
  attachments: [{ name: "logo.png", contentType: "image/png" }],
};

async function main() {
  const dup = await findDuplicateOutlookIntake(sample.messageId);
  if (dup) {
    console.log("Duplicate (unexpected for fresh id):", dup.id);
    return;
  }

  const bodyForParser =
    sample.body +
    `\n\n[Outlook receivedAt: ${sample.receivedAt}]` +
    `\n\n[Attachments]\n- ${sample.attachments[0].name} [${sample.attachments[0].contentType}]`;

  const parsed = parseEmailIntake({
    fromName: sample.fromName,
    fromEmail: sample.fromEmail,
    subject: sample.subject,
    body: bodyForParser,
  });

  const result = await executeEmailIntakePipeline(parsed, {
    outlookMessageId: sample.messageId,
    extraNotes: `Outlook messageId: ${sample.messageId}`,
  });

  console.log(JSON.stringify({ parsed: result.parsed, order: result.order, integrations: { sharepoint: result.sharepoint, teams: result.teamsIntake } }, null, 2));

  const dup2 = await findDuplicateOutlookIntake(sample.messageId);
  console.log("Second lookup (should find order):", dup2?.id ?? null);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
