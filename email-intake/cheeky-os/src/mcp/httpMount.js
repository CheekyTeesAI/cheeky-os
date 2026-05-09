"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

/**
 * Mount MCP SSE transport on the main Cheeky OS Express app.
 * Routes: GET /mcp (SSE), POST /mcp/message (JSON-RPC messages)
 */
function mountCheekyOsMcpSse(app) {
  const transports = new Map();

  function getOrigin(req) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const proto = forwardedProto || req.protocol || "http";
    const host = req.get("host") || "127.0.0.1:3000";
    return `${proto}://${host}`;
  }

  function toToolContent(payload) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  async function callJson(req, method, path, body) {
    const baseUrl = getOrigin(req);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  async function callChatgptActionRoute(req, method, path, body) {
    const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
    if (!key) {
      return {
        ok: false,
        status: 401,
        data: {
          error: true,
          message: "CHATGPT_ACTION_API_KEY is not set on the Cheeky OS server.",
        },
      };
    }

    const baseUrl = getOrigin(req);
    const headers = { "x-api-key": key };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  function createMcpServerForSession(req) {
    const server = new Server(
      {
        name: "cheeky-os-mcp-http",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const tools = [
      {
        name: "get_orders",
        description: "GET /api/orders - list recent orders",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "get_tasks",
        description: "GET /api/tasks - list production tasks",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "get_health",
        description: "GET /cheeky/health - system status",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "create_voice_run",
        description: "POST /voice/run - parse a new order",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Natural language input to parse." },
          },
          required: ["text"],
          additionalProperties: true,
        },
      },
      {
        name: "push_cursor_task",
        description: "POST /api/cursor/task — enqueue Cursor task (CHATGPT_ACTION_API_KEY).",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Work instruction." },
            context: { type: "string", description: "Supporting context." },
            priority: { type: "string", description: "Priority label." },
          },
          required: ["task"],
          additionalProperties: false,
        },
      },
      {
        name: "get_next_cursor_task",
        description: "GET /api/cursor/task/next — dequeue next task (CHATGPT_ACTION_API_KEY).",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ];

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request && request.params ? request.params.name : "";
      const args = request && request.params ? request.params.arguments || {} : {};

      if (toolName === "get_orders") {
        return toToolContent(await callJson(req, "GET", "/api/orders"));
      }
      if (toolName === "get_tasks") {
        return toToolContent(await callJson(req, "GET", "/api/tasks"));
      }
      if (toolName === "get_health") {
        return toToolContent(await callJson(req, "GET", "/cheeky/health"));
      }
      if (toolName === "create_voice_run") {
        return toToolContent(await callJson(req, "POST", "/voice/run", args));
      }
      if (toolName === "push_cursor_task") {
        const task = args && typeof args.task === "string" ? args.task.trim() : "";
        if (!task) {
          return toToolContent({ ok: false, error: true, message: 'Missing required field "task".' });
        }
        const context = args && args.context != null ? String(args.context) : "";
        const priority =
          args && args.priority != null && String(args.priority).trim()
            ? String(args.priority).trim()
            : "normal";
        return toToolContent(await callChatgptActionRoute(req, "POST", "/api/cursor/task", { task, context, priority }));
      }
      if (toolName === "get_next_cursor_task") {
        return toToolContent(await callChatgptActionRoute(req, "GET", "/api/cursor/task/next"));
      }

      return toToolContent({
        ok: false,
        error: true,
        message: `Unknown tool: ${toolName}`,
      });
    });

    return server;
  }

  app.get("/mcp", async (req, res) => {
    try {
      const transport = new SSEServerTransport("/mcp/message", res);
      const server = createMcpServerForSession(req);
      transports.set(transport.sessionId, { transport, server });
      res.on("close", async () => {
        transports.delete(transport.sessionId);
        try {
          await server.close();
        } catch (_e) {
          /* ignore */
        }
        try {
          await transport.close();
        } catch (_e) {
          /* ignore */
        }
      });
      await server.connect(transport);
    } catch (err) {
      console.error("[mcp-http] SSE init error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({
          error: true,
          message: err && err.message ? err.message : "MCP SSE initialization error",
        });
      }
    }
  });

  app.post("/mcp/message", async (req, res) => {
    const sessionId = req.query && typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    const entry = transports.get(sessionId);
    if (!entry || !entry.transport) {
      return res.status(400).json({
        error: true,
        message: "Invalid or missing sessionId.",
      });
    }

    try {
      await entry.transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error("[mcp-http] message handling error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({
          error: true,
          message: err && err.message ? err.message : "MCP message handling failed",
        });
      }
    }
  });
}

module.exports = { mountCheekyOsMcpSse };
