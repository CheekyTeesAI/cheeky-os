"use strict";

const HEARTBEAT_MS = 30000;

/**
 * Mount a minimal SSE endpoint on the main Cheeky OS Express app.
 * No MCP SDK dependency; raw Express + Node response stream only.
 */
function mountCheekyOsMcpSse(app) {
  app.get("/sse", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    res.write('data: {"type":"endpoint","uri":"/message"}\n\n');

    const heartbeatTimer = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatTimer);
        return;
      }
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeatTimer);
    });
  });

  app.post("/message", (_req, res) => {
    res.status(200).end();
  });
}

module.exports = { mountCheekyOsMcpSse };
