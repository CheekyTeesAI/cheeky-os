"use strict";

const express = require("express");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { tools, toolMap } = require("./index");

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

async function main() {
  const app = express();
  const port = 3100;
  const transports = new Map();

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
      console.error("[mcp] tool execution error:", err && err.stack ? err.stack : err);
      return toToolContent({
        error: true,
        message: err && err.message ? err.message : String(err),
      });
    }
  });

  app.use(express.json());

  app.get("/sse", async (_req, res) => {
    try {
      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);
      res.on("close", () => transports.delete(transport.sessionId));
      await server.connect(transport);
    } catch (err) {
      console.error("[mcp] SSE init error:", err && err.stack ? err.stack : err);
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
      console.error("[mcp] message handling error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({ error: true, message: "Message handling failed." });
      }
    }
  });

  app.listen(port, () => {
    console.error("Cheeky OS MCP running on http://localhost:3100/sse");
  });
}

main().catch((err) => {
  console.error("[mcp] fatal startup error:", err && err.stack ? err.stack : err);
  process.exit(1);
});
