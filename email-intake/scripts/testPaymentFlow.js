"use strict";

const path = require("path");
const axios = require("axios");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const API_PORT = Number(process.env.PORT || 3000);
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const samples = [
  {
    label: "Screen print (vendor path)",
    body: {
      customer: "Hillcrest Baseball",
      customerEmail: "customer.service@cheekyteesllc.com",
      estimateId: "est_hillcrest_1",
      squarePaymentId: "pay_demo_1",
      squareOrderId: "ord_demo_1",
      depositPaid: 300,
      totalAmount: 900,
      quantity: 48,
      designColors: 2,
      notes: "Demo screen print deposit",
    },
  },
  {
    label: "In-house DTG",
    body: {
      customer: "Goodman Mills",
      customerEmail: "customer.service@cheekyteesllc.com",
      estimateId: "est_goodman_1",
      squarePaymentId: "pay_demo_2",
      squareOrderId: "ord_demo_2",
      depositPaid: 120,
      totalAmount: 240,
      quantity: 12,
      designColors: 5,
      notes: "Demo DTG deposit",
    },
  },
];

(async function main() {
  for (const s of samples) {
    console.log("\n======== POST /payment —", s.label, "========\n");
    try {
      const res = await axios.post(`${API_BASE}/payment`, s.body, {
        validateStatus: () => true,
        timeout: 60000,
      });
      console.log("status:", res.status);
      console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("POST failed:", err.message);
    }
  }

  console.log("\n======== GET /orders ========\n");
  try {
    const r = await axios.get(`${API_BASE}/orders`, { validateStatus: () => true });
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error(e);
  }

  console.log("\n======== GET /orders/metrics ========\n");
  try {
    const r = await axios.get(`${API_BASE}/orders/metrics`, { validateStatus: () => true });
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error(e);
  }

  console.log("\n======== GET /tasks ========\n");
  try {
    const r = await axios.get(`${API_BASE}/tasks`, { validateStatus: () => true });
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error(e);
  }

  console.log("\nCHEEKY OS payment flow test complete.\n");
})();
