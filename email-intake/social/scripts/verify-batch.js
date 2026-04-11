"use strict";

/**
 * Smoke: runBatch with mocked Prisma (no DATABASE_URL).
 */

const { runBatch } = require("../lib/contentEngine");
const { passThreshold } = require("../lib/brandGuard");

let idSeq = 0;
const stored = { posts: [] };

const mockPrisma = {
  socialPost: {
    create: async ({ data }) => {
      const row = {
        id: `post-${++idSeq}`,
        ...data,
        scheduledDate: data.scheduledDate,
        createdAt: new Date()
      };
      stored.posts.push(row);
      return row;
    }
  }
};

globalThis.__CHEEKY_PRISMA_SINGLETON__ = mockPrisma;

async function main() {
  const out = await runBatch({ count: 7 });
  if (!out.ok) throw new Error("runBatch not ok");
  if (out.generated !== 7) throw new Error(`expected 7 posts, got ${out.generated}`);
  for (const p of out.posts) {
    if (!passThreshold(p.engagementScore)) {
      throw new Error(`score ${p.engagementScore} < 85 for ${p.id}`);
    }
  }
  console.log("verify-batch: OK", {
    generated: out.generated,
    scores: out.posts.map((x) => x.engagementScore)
  });
}

main().catch((err) => {
  console.error("verify-batch: FAIL", err.message);
  process.exit(1);
});
