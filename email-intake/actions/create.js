"use strict";

const square = require("../lib/integrations/square");
const dataverse = require("../lib/integrations/dataverse");
const memory = require("../lib/memory");
const execu = require("../lib/execution");

/**
 * @param {{ type: string, entity: string, intent: string, data: object, raw: string, confidence?: number }} command
 */
module.exports = async function createHandler(command) {
  console.log("ACTION → CREATE", command.entity, command.data);
  const exec = execu.createExecution("CREATE");
  const d = /** @type {Record<string, any>} */ (command.data || {});

  try {
    if (command.entity === "estimate") {
      console.log("📋 CREATE estimate — parsed command:", command);
      const custRes = await dataverse.createOrUpdateCustomer({
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        email: d.email || "",
        phone: d.phone || "",
        company: d.company || "",
        notes: `Parsed from command: ${command.raw.slice(0, 500)}`,
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_upsert_customer", custRes);

      const qty = Math.max(1, Number(d.quantity) || 1);
      const estimatePayload = {
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        email: d.email || "",
        items: [
          {
            name: "Custom Apparel",
            quantity: qty,
            unitAmount: 20,
          },
        ],
        note: String(command.raw || ""),
        reference:
          d.company ||
          `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
          "Estimate",
      };
      console.log("📦 Estimate payload:", estimatePayload);

      const sqRes = await square.createDraftEstimate(estimatePayload);
      console.log("💰 Square createDraftEstimate response:", sqRes);
      execu.addStep(exec, "square_draft_estimate", sqRes);

      const actRes = await dataverse.createOrderActivity({
        activityType: "estimate",
        subject: `Estimate draft ${sqRes.estimateId || ""}`.trim(),
        status: sqRes.success ? "DraftCreated" : "DraftFailed",
        customerEmail: d.email || "",
        details: command.raw,
        externalId: sqRes.estimateId || "",
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_order_activity", actRes);

      const taskRes = await dataverse.createTaskRecord({
        title: "Review estimate draft",
        taskType: "sales_followup",
        status: "New",
        priority: "Normal",
        owner: "",
        dueDate: "",
        customerEmail: d.email || "",
        notes: `Square: ${sqRes.message}; estimateId=${sqRes.estimateId || "n/a"}`,
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_followup_task", taskRes);

      execu.finalizeMode(exec);
      const slug = execu.slug(
        `${d.firstName || ""}_${d.lastName || ""}_${d.company || "estimate"}`
      );
      const summary = [
        `# CREATE estimate`,
        ``,
        `- **Raw:** ${command.raw}`,
        `- **Intent:** ${command.intent} (confidence ${command.confidence ?? "n/a"})`,
        `- **Execution mode:** ${exec.mode}`,
        `- **Customer (Dataverse):** ${custRes.message}`,
        `- **Square:** ${sqRes.message}${sqRes.estimateId ? ` id=${sqRes.estimateId}` : ""}`,
        `- **Activity:** ${actRes.message}`,
        `- **Task:** ${taskRes.message}`,
      ].join("\n");
      memory.writeCommandSummary("sales", slug, summary);
      memory.appendLog(
        `## [${new Date().toISOString()}] CREATE estimate | mode=${exec.mode}\n${summary}\n`
      );

      return {
        success: execu.overallSuccess(exec),
        execution: exec,
      };
    }

    if (command.entity === "task") {
      const title =
        String(d.subject || d.notes || command.raw).slice(0, 200) ||
        "Command task";
      const taskRes = await dataverse.createTaskRecord({
        title,
        taskType: "operator",
        status: "New",
        priority: "Normal",
        owner: "",
        dueDate: "",
        customerEmail: d.email || "",
        notes: command.raw,
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_create_task", taskRes);
      execu.finalizeMode(exec);
      const slug = execu.slug(title);
      memory.writeCommandSummary("sales", slug, `# CREATE task\n\n${command.raw}\n\n${taskRes.message}`);
      memory.appendLog(
        `## [${new Date().toISOString()}] CREATE task | ${title}\n- ${taskRes.message}\n`
      );
      return { success: execu.overallSuccess(exec), execution: exec };
    }

    if (command.entity === "customer") {
      const custRes = await dataverse.createOrUpdateCustomer({
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        email: d.email || "",
        phone: d.phone || "",
        company: d.company || "",
        notes: command.raw,
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_upsert_customer", custRes);
      const sqRes = await square.saveCustomer({
        name: [d.firstName, d.lastName].filter(Boolean).join(" ") || d.company || "Customer",
        email: d.email,
        phone: d.phone,
        company: d.company,
        raw: command.raw,
      });
      execu.addStep(exec, "square_save_customer", sqRes);
      execu.finalizeMode(exec);
      memory.writeCommandSummary(
        "sales",
        execu.slug(`customer_${d.company || d.lastName || "contact"}`),
        `# CREATE customer\n\n${command.raw}\n\n${custRes.message}\n${sqRes.message}`
      );
      memory.appendLog(
        `## [${new Date().toISOString()}] CREATE customer\n- DV: ${custRes.message}; Square: ${sqRes.message}\n`
      );
      return { success: execu.overallSuccess(exec), execution: exec };
    }

    const fallback = await square.createDraftEstimate({
      customerGivenName: d.firstName || "Customer",
      customerFamilyName: d.lastName || "",
      email: d.email || "",
      phone: d.phone || "",
      company: d.company || "",
      items: d.items,
      quantity: d.quantity,
      note: command.raw,
      reference: command.entity,
    });
    execu.addStep(exec, "square_draft_estimate_fallback", fallback);
    execu.finalizeMode(exec);
    memory.appendLog(
      `## [${new Date().toISOString()}] CREATE (fallback ${command.entity})\n- ${fallback.message}\n`
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
    memory.appendLog(
      `## [${new Date().toISOString()}] CREATE ERROR\n- ${msg}\n`
    );
    return { success: false, execution: exec };
  }
};
