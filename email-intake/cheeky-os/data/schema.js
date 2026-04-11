/**
 * Cheeky OS — Data schema definitions.
 * Plain JS objects describing entity shapes for the data layer.
 *
 * @module cheeky-os/data/schema
 */

const CustomerSchema = {
  id: "string",
  name: "string",
  email: "string",
  phone: "string",
  company: "string",
  createdAt: "string (ISO 8601)",
  updatedAt: "string (ISO 8601)",
};

const DealSchema = {
  id: "string",
  customerId: "string",
  customerName: "string",
  customerEmail: "string",
  invoiceId: "string",
  total: "number",
  deposit: "number",
  status: "string (draft | sent | paid | stale | hot)",
  stage: "string (lead | quoted | invoiced | followed_up | closed)",
  lastContactAt: "string (ISO 8601)",
  createdAt: "string (ISO 8601)",
  updatedAt: "string (ISO 8601)",
  notes: "string",
};

const PaymentSchema = {
  id: "string",
  dealId: "string",
  invoiceId: "string",
  amount: "number",
  status: "string",
  paidAt: "string (ISO 8601)",
  createdAt: "string (ISO 8601)",
};

const EventSchema = {
  id: "string",
  type: "string",
  entityType: "string",
  entityId: "string",
  message: "string",
  value: "any",
  createdAt: "string (ISO 8601)",
};

module.exports = {
  CustomerSchema,
  DealSchema,
  PaymentSchema,
  EventSchema,
};
