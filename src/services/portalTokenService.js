"use strict";

const crypto = require("crypto");

function generatePortalToken() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = { generatePortalToken };
