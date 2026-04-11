"use strict";

/**
 * Minimal HTTP smoke for /social routes (mocked DB).
 */

const http = require("http");
const express = require("express");

const posts = [];

function mockDb() {
  return {
    socialPost: {
      findMany: async ({ where, take }) => {
        let rows = [...posts];
        if (where && where.status) {
          rows = rows.filter((p) => p.status === where.status);
        }
        rows.sort((a, b) => a.scheduledDate - b.scheduledDate);
        return rows.slice(0, take || 50);
      },
      create: async ({ data }) => {
        const row = { id: `p${posts.length + 1}`, ...data };
        posts.push(row);
        return row;
      },
      count: async ({ where }) => {
        let rows = [...posts];
        if (where && where.status) {
          rows = rows.filter((p) => p.status === where.status);
        }
        if (where && where.scheduledDate && where.scheduledDate.gte) {
          const min = where.scheduledDate.gte;
          rows = rows.filter((p) => p.scheduledDate >= min);
        }
        return rows.length;
      }
    }
  };
}

async function readJson(res) {
  const chunks = [];
  for await (const c of res) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) =>
      readJson(res).then((j) => resolve({ status: res.statusCode, body: j }))
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  globalThis.__CHEEKY_PRISMA_SINGLETON__ = mockDb();
  posts.length = 0;

  const app = express();
  app.use(express.json());
  app.use(require("../routes/social"));

  const server = await new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();

  const gen = await request(
    {
      hostname: "127.0.0.1",
      port,
      path: "/social/generate-batch",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    },
    { count: 7 }
  );
  if (gen.status !== 200 || !gen.body.ok || gen.body.generated !== 7) {
    server.close();
    throw new Error(`generate-batch: ${gen.status} ${JSON.stringify(gen.body)}`);
  }

  const q = await request({
    hostname: "127.0.0.1",
    port,
    path: "/social/approval-queue",
    method: "GET"
  });
  if (q.status !== 200 || !q.body.ok || q.body.count !== 7) {
    server.close();
    throw new Error(`approval-queue: ${q.status} ${JSON.stringify(q.body)}`);
  }

  const w = await request({
    hostname: "127.0.0.1",
    port,
    path: "/social/weekly-summary",
    method: "GET"
  });
  if (w.status !== 200 || !w.body.ok) {
    server.close();
    throw new Error(`weekly-summary: ${w.status} ${JSON.stringify(w.body)}`);
  }

  server.close();
  console.log("verify-routes: OK");
}

main().catch((e) => {
  console.error("verify-routes: FAIL", e.message);
  process.exit(1);
});
