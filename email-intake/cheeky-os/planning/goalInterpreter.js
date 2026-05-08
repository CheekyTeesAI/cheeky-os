"use strict";

/**
 * Lightweight goal tagging — heuristic-only (no embeddings, no outbound).
 */

function classifyGoal(phrase) {
  try {
    const s = String(phrase || "").toLowerCase();
    /** @type {string[]} */
    const themes = [];

    let primary = "operational_health";

    if (/\bschool|district|education|spirit wear\b/.test(s)) {
      primary = "school_sales";

      themes.push("school_vertical");

    }

    if (/revenue|cash|deposit|paid|invoice|unpaid\b/.test(s)) {
      themes.push("revenue");

      if (primary === "operational_health") primary = "revenue_recovery";

    }

    if (/product|production|floor|floor schedule|qc|embroider|screen\b/.test(s)) {
      themes.push("production");

      if (primary === "operational_health") primary = "production_throughput";

    }

    if (/email|follow up|touch|crm|respond\b/.test(s)) {
      themes.push("communication");

    }

    if (/blank|shirt|inventory|sanmar|reorder\b/.test(s)) {

      themes.push("supply_chain");

      if (primary === "operational_health") primary = "inventory_ops";

    }

    return {

      success: true,

      primary,

      themes: Array.from(new Set(themes)),

    };

  } catch (_e) {

    return {

      success: false,

      primary: "unknown",

      themes: [],

    };

  }

}

module.exports = {

  classifyGoal,

};
