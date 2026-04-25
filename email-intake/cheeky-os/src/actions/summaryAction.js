"use strict";

const getSummary = require("../operator/summary");

module.exports = async function summaryAction() {
  try {
    const data = await getSummary();

    return {
      success: true,
      message: "Here is the current business summary",
      data,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
