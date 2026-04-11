import { createHash } from "crypto";
import { db } from "../client";

function placeholderEmail(name: string): string {
  const h = createHash("sha256")
    .update(name.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
  return `cheeky+${h}@placeholder.cheeky`;
}

/**
 * Find by display name or create with deterministic placeholder email (Prisma unique).
 */
export async function findOrCreateByName(name: string) {
  const trimmed = name.trim();
  const existing = await db.customer.findFirst({
    where: { name: trimmed }
  });
  if (existing) {
    return existing;
  }
  return db.customer.create({
    data: {
      name: trimmed,
      email: placeholderEmail(trimmed)
    }
  });
}
