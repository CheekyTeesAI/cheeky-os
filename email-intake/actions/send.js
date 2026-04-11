"use strict";

const outlook = require("../lib/integrations/outlook");
const dataverse = require("../lib/integrations/dataverse");
const memory = require("../lib/memory");
const execu = require("../lib/execution");
const config = require("../lib/config");

/**
 * @param {{ type: string, entity: string, intent: string, data: object, raw: string, confidence?: number }} command
 */
module.exports = async function sendHandler(command) {
  console.log("ACTION → SEND", command.entity, command.data);
  console.log("📨 SEND ACTION:", command);
  const exec = execu.createExecution("SEND");
  const d = /** @type {Record<string, any>} */ (command.data || {});

  try {
    const raw = String(command && command.raw != null ? command.raw : "").trim();
    const hasEmail = Boolean(String(d.email || "").trim());

    let to = "";
    let subject = "";
    let body = "";

    if (!hasEmail) {
      to = String(config.defaultFromEmail || "").trim();
      subject = "Follow up from Cheeky Tees";
      body = `Hey — following up from Cheeky Tees.\n\n${raw}`;
    } else {
      to = String(d.email || "").trim();
      subject =
        String(d.subject || "").trim() || "Follow up from Cheeky Tees";
      body =
        String(d.body || "").trim() ||
        `Hey — following up from Cheeky Tees.\n\n${raw}`;
    }

    console.log("📧 EMAIL DATA:", { to, subject, body });

    const mailRes = await outlook.sendEmail({
      to,
      subject: subject.slice(0, 200),
      body,
      cc: String(d.cc || "").trim() || undefined,
      bcc: String(d.bcc || "").trim() || undefined,
    });
    execu.addStep(exec, "Outlook send attempted", mailRes);

    const actRes = await dataverse.createOrderActivity({
      activityType: "email",
      subject: `Email: ${String(subject || "").slice(0, 80)}`,
      status: mailRes.success ? "Sent" : "Attempted",
      customerEmail: String(d.email || ""),
      details: raw,
      externalId: "",
      source: "cheeky_os_command",
    });
    execu.addStep(exec, "dataverse_order_activity", actRes);

    execu.finalizeMode(exec);

    const slug = execu.slug(
      `email_${String(d.company || d.lastName || d.firstName || "send")}`
    );
    const summary = [
      `# SEND email`,
      ``,
      `- **Raw:** ${raw}`,
      `- **To:** ${to}`,
      `- **Mail:** ${String(mailRes.message || "")}`,
      `- **Activity:** ${String(actRes.message || "")}`,
      `- **Mode:** ${exec.mode}`,
    ].join("\n");
    memory.writeCommandSummary("sales", slug, summary);
    memory.appendLog(
      `## [${new Date().toISOString()}] SEND | ${exec.mode}\n${summary}\n`
    );

    return { success: execu.overallSuccess(exec), execution: exec };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execu.addStep(exec, "error", {
      success: false,
      mode: "stub",
      message: msg,
    });
    execu.finalizeMode(exec);
    memory.appendLog(`## [${new Date().toISOString()}] SEND ERROR\n- ${msg}\n`);
    return { success: false, execution: exec };
  }
};
