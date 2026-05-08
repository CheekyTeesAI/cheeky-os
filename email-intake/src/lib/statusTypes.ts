/**
 * Prisma `Order.status` and related fields use `String` in schema — not generated Prisma enums.
 * Use these aliases so imports stay type-safe without `@prisma/client` enum drift.
 */
export type OrderStatus = string;
export type TaskStatus = string;
