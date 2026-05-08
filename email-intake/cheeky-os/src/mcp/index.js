"use strict";

const { getOrders } = require("./tools/orders");
const { getTasks, updateTaskStatus } = require("./tools/tasks");
const { getSystemStatus } = require("./tools/system");
const { createMemo } = require("./tools/memory");
const { runVoiceCommand } = require("./tools/voice");

const tools = [
  {
    name: "get_orders",
    description: "Fetch recent orders from Cheeky OS.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional order status filter." },
        limit: { type: "number", description: "Optional max records (default 10)." },
      },
      additionalProperties: false,
    },
    handler: getOrders,
  },
  {
    name: "get_tasks",
    description: "Fetch production tasks from Cheeky OS.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional task status filter." },
        orderId: { type: "string", description: "Optional linked order ID filter." },
        limit: { type: "number", description: "Optional max records (default 10)." },
      },
      additionalProperties: false,
    },
    handler: getTasks,
  },
  {
    name: "update_task_status",
    description: "Update status of a production task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to update." },
        status: { type: "string", description: "New task status value." },
      },
      required: ["taskId", "status"],
      additionalProperties: false,
    },
    handler: updateTaskStatus,
  },
  {
    name: "get_system_status",
    description: "Return health snapshot of Cheeky OS.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: getSystemStatus,
  },
  {
    name: "create_memo",
    description: "Write an internal memo into CheekyMemory table.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Memo topic slug (kebab-case)." },
        content: { type: "string", description: "Memo content/body." },
        source: { type: "string", description: 'Optional source; defaults to "claude-desktop".' },
      },
      required: ["topic", "content"],
      additionalProperties: false,
    },
    handler: createMemo,
  },
  {
    name: "run_voice_command",
    description: "Send natural language command to voice parser endpoint.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Natural language command text." },
      },
      required: ["command"],
      additionalProperties: false,
    },
    handler: runVoiceCommand,
  },
];

const toolMap = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

module.exports = {
  tools,
  toolMap,
};
