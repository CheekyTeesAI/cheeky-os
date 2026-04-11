"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateByName = findOrCreateByName;
const crypto_1 = require("crypto");
const client_1 = require("../client");
function placeholderEmail(name) {
    const h = (0, crypto_1.createHash)("sha256")
        .update(name.trim().toLowerCase())
        .digest("hex")
        .slice(0, 32);
    return `cheeky+${h}@placeholder.cheeky`;
}
/**
 * Find by display name or create with deterministic placeholder email (Prisma unique).
 */
async function findOrCreateByName(name) {
    const trimmed = name.trim();
    const existing = await client_1.db.customer.findFirst({
        where: { name: trimmed }
    });
    if (existing) {
        return existing;
    }
    return client_1.db.customer.create({
        data: {
            name: trimmed,
            email: placeholderEmail(trimmed)
        }
    });
}
