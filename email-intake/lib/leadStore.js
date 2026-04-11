"use strict";

/** @type {Array<Record<string, unknown>>} */
const leads = [];

/**
 * @param {Record<string, unknown>} data
 */
function createLead(data) {
  const d = data && typeof data === "object" ? data : {};
  const lead = {
    id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 6),
    name: d.firstName || d.name || "Unknown",
    email: d.email || null,
    phone: d.phone || null,
    message: d.raw || d.message || "",
    status: "new",
    createdAt: new Date().toISOString(),
    lastContact: null,
  };
  leads.push(lead);
  return lead;
}

function getLeads() {
  return [...leads];
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} updates
 */
function updateLead(id, updates) {
  const lead = leads.find((l) => String(l.id) === String(id));
  if (!lead) return null;
  Object.assign(lead, updates);
  return lead;
}

module.exports = {
  createLead,
  getLeads,
  updateLead,
};
