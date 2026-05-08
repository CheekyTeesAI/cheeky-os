"use strict";

function tokenBag(text) {
  try {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w && w.length > 2 && !/^the|and|for|with|into|that|from$/.test(w));
  } catch (_e) {
    return [];
  }
}

function jaccard(a, b) {
  try {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((x) => {
      if (B.has(x)) inter++;
    });
    return inter / (A.size + B.size - inter);
  } catch (_e) {
    return 0;
  }
}

/**
 * @returns {{ score: number, reasons: string[] }}
 */
function scoreAgainstMemory(candidateTask, memRow) {
  const reasons = [];
  let score = 0;

  try {
      const tgt = String((candidateTask && candidateTask.target) || "").toLowerCase();
      const mtgt = String((memRow && memRow.targetKey) || "").toLowerCase();
      if (tgt && mtgt && tgt === mtgt) {
        score += 50;
        reasons.push("exact_target");
      } else if (tgt && mtgt && (tgt.includes(mtgt) || mtgt.includes(tgt))) {
        score += 28;
        reasons.push("partial_target");
      }

      const ti = String((candidateTask && candidateTask.intent) || "").toLowerCase();

      const mi = String((memRow && memRow.category) || "").toLowerCase();

      if (ti && mi && ti === mi) {

        score += 12;

        reasons.push("intent_match");

      }

      const cq = tokenBag(`${tgt} ${(candidateTask.requirements || []).join(" ")}`);

      const mq = tokenBag(`${memRow.summary || ""} ${(memRow.tags || []).join(" ")}`);

      const jac = jaccard(cq, mq);

      if (jac > 0) {

        score += jac * 30;

        reasons.push(`keyword_overlap:${jac.toFixed(2)}`);

      }

      const reqOv = jaccard(

          (candidateTask.requirements || []).map((x) => String(x).toLowerCase()),

          (memRow.tags || []).map((x) => String(x).toLowerCase())

        );

      if (reqOv > 0.01) {

        score += reqOv * 15;

        reasons.push("requirements_tags_overlap");

      }

      const candOut = ""; /** live task unknown */

      const mo = String((memRow && memRow.outcome) || "");

      if (mo && candOut && mo === candOut) {

        score += 4;

      }

      if (mo === "failed") {

        reasons.push("prior_failed_signal");

      }

      return {

        score: Math.round(score * 100) / 100,

        reasons,

      };

    } catch (_e) {

      return {

        score: 0,

        reasons: ["score_error"],

      };

    }

}

module.exports = {

  scoreAgainstMemory,

  tokenBag,

  jaccard,

};
