"use strict";

const { randomUUID } = require("crypto");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

/**
 * Mount MCP Streamable HTTP transport on the main Cheeky OS Express app.
 * Route: POST /mcp
 */
function mountCheekyOsMcpSse(app) {
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

  function createMcpServer(req) {
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

      return toToolContent({
        ok: false,
        error: true,
        message: `Unknown tool: ${toolName}`,
      });
    });

    return server;
  }

  app.post("/mcp", async (req, res) => {
    let server = null;
    try {
      server = createMcpServer(req);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      res.on("close", async () => {
        try {
          await transport.close();
        } catch (_e) {
          /* ignore */
        }
        try {
          await server.close();
        } catch (_e2) {
          /* ignore */
        }
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mcp-http] transport error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({
          error: true,
          message: err && err.message ? err.message : "MCP transport error",
        });
      }
      if (server) {
        try {
          await server.close();
        } catch (_e3) {
          /* ignore */
        }
      }
    }
  });
}

module.exports = { mountCheekyOsMcpSse };
