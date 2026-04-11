"use strict";

const path = require("path");
const axios = require("axios");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const API_PORT = Number(process.env.PORT || 3000);
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const samples = [
  "create estimate for fountain inn baseball 36 shirts",
  "create estimate for goodman mills polos 24 pieces",
  "create estimate for hillcrest band 72 shirts",
];

(async function main() {
  for (const message of samples) {
    try {
      const res = await axios.post(
        `${API_BASE}/intake`,
        { message },
        { validateStatus: () => true, timeout: 120000 }
      );
      console.log("POST /intake", message.slice(0, 50) + "…");
      console.log("status:", res.status);
      console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("failed:", err.message);
    }
    console.log("");
  }
  console.log("CHEEKY OS demo seed done — open /board.html");
})();
