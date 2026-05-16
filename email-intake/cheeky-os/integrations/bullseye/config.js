"use strict";

// Bullseye Automation Config
// Email work orders for screenprint + embroidery upon deposit paid

const config = {
  bullseyeEmail: process.env.BULLSEYE_EMAIL || 'orders@bullseyescreenprinting.com', // Update with real email
  fromEmail: process.env.CHEEKY_FROM_EMAIL || 'orders@cheekytees.com',
  ccEmails: [],
  mockMode: !process.env.BULLSEYE_EMAIL,
};

module.exports = config;
