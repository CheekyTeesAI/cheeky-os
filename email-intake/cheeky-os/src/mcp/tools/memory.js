"use strict";

const prisma = require("../../../../src/lib/prisma");

async function createMemo(input) {
  try {
    if (!prisma) {
      return { error: true, message: "Prisma client is unavailable." };
    }

    const topic = input && typeof input.topic === "string" ? input.topic.trim() : "";
    const content = input && typeof input.content === "string" ? input.content.trim() : "";
    const source =
      input && typeof input.source === "string" && input.source.trim()
        ? input.source.trim()
        : "claude-desktop";

    if (!topic) return { error: true, message: 'Missing required field "topic".' };
    if (!content) return { error: true, message: 'Missing required field "content".' };

    if (!prisma.customerMemory) {
      return {
        error: true,
        message: 'Prisma model "CustomerMemory" is unavailable in this schema.',
      };
    }

    const record = await prisma.customerMemory.upsert({
      where: { customerKey: topic },
      update: {
        customerName: content,
        lastProduct: source,
      },
      create: {
        customerKey: topic,
        customerName: content,
        lastProduct: source,
      },
    });

    return {
      error: false,
      data: {
        id: record.id,
        topic: record.customerKey,
        content: record.customerName || "",
        source: record.lastProduct || "claude-desktop",
        updatedAt: record.updatedAt,
        raw: record,
      },
    };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  createMemo,
};
