"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const emailIntakeParser_1 = require("../services/emailIntakeParser");
const emailIntakeOrderService_1 = require("../services/emailIntakeOrderService");
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
    const dup = await (0, emailIntakeOrderService_1.findDuplicateOutlookIntake)(sample.messageId);
    if (dup) {
        console.log("Duplicate (unexpected for fresh id):", dup.id);
        return;
    }
    const bodyForParser = sample.body +
        `\n\n[Outlook receivedAt: ${sample.receivedAt}]` +
        `\n\n[Attachments]\n- ${sample.attachments[0].name} [${sample.attachments[0].contentType}]`;
    const parsed = (0, emailIntakeParser_1.parseEmailIntake)({
        fromName: sample.fromName,
        fromEmail: sample.fromEmail,
        subject: sample.subject,
        body: bodyForParser,
    });
    const result = await (0, emailIntakeOrderService_1.executeEmailIntakePipeline)(parsed, {
        outlookMessageId: sample.messageId,
        extraNotes: `Outlook messageId: ${sample.messageId}`,
    });
    console.log(JSON.stringify({ parsed: result.parsed, order: result.order, integrations: { sharepoint: result.sharepoint, teams: result.teamsIntake } }, null, 2));
    const dup2 = await (0, emailIntakeOrderService_1.findDuplicateOutlookIntake)(sample.messageId);
    console.log("Second lookup (should find order):", dup2?.id ?? null);
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
