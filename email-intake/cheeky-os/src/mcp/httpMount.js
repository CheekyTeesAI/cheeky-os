"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { tools, toolMap } = require("./index");

const HEARTBEAT_MS = 30000;

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

function createMcpServerForSession() {
  const server = new Server(
    {
      name: "cheeky-os-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request && request.params ? request.params.name : "";
    const args = request && request.params ? request.params.arguments || {} : {};

    try {
      const tool = toolMap[toolName];
      if (!tool) {
        return toToolContent({ error: true, message: `Unknown tool: ${toolName}` });
      }

      const result = await tool.handler(args);
      return toToolContent(result);
    } catch (err) {
      console.error("[mcp-http] tool execution error:", err && err.stack ? err.stack : err);
      return toToolContent({
        error: true,
        message: err && err.message ? err.message : String(err),
      });
    }
  });

  return server;
}

/**
 * Mount MCP SSE transport on the main Cheeky OS Express app (e.g. port 3000).
 * GET /sse — SSE stream; POST /message — client messages (sessionId query).
 */
function mountCheekyOsMcpSse(app) {
  const transports = new Map();

  app.get("/sse", async (_req, res) => {
    const mcpServer = createMcpServerForSession();
    let pingTimer = null;
    try {
      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);

      const cleanup = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        transports.delete(transport.sessionId);
      };

      pingTimer = setInterval(() => {
        try {
          if (res.writableEnded || res.destroyed) {
            cleanup();
            return;
          }
          res.write(`: ping ${Date.now()}\n\n`);
        } catch (_e) {
          cleanup();
        }
      }, HEARTBEAT_MS);

      res.on("close", cleanup);

      await mcpServer.connect(transport);
    } catch (err) {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      console.error("[mcp-http] SSE init error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({ error: true, message: "Failed to initialize SSE transport." });
      }
    }
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query && typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    const transport = transports.get(sessionId);

    if (!transport) {
      return res.status(400).json({ error: true, message: "Invalid or missing sessionId." });
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error("[mcp-http] message handling error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({ error: true, message: "Message handling failed." });
      }
    }
  });
}

module.exports = { mountCheekyOsMcpSse };
