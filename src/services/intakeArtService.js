/**
 * Art / attachment detection and file placement (best-effort, non-throwing).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function detectArtFromIntake(raw, attachments) {
  const body = String((raw && raw.body) || "");
  const sub = String((raw && raw.subject) || "");
  const combined = `${sub}\n${body}`.toLowerCase();
  const artWords =
    /\bart(work)?\b|\blogo\b|\bvector\b|\beps\b|\bai\b|\bpdf\b|\bproof\b|\bscreen\s*print\b/i.test(combined);
  const attachHint = /\battach|\bupload|\benclosed/i.test(combined);
  const count = Array.isArray(attachments) ? attachments.length : 0;
  const artDetected = count > 0 || artWords || attachHint;
  return { artDetected, attachmentCount: count, textHints: { artWords, attachHint } };
}

function guessKind(filename, mimeType) {
  const f = String(filename || "").toLowerCase();
  const m = String(mimeType || "").toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|svg|ai|eps|pdf|psd)$/i.test(f)) return "ART";
  if (m.includes("image") || m.includes("pdf") || m.includes("postscript")) return "ART";
  if (/\.(doc|docx|txt)$/i.test(f)) return "OTHER";
  return "UNKNOWN";
}

function safeWriteBase64(dir, filename, base64) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(String(base64 || ""), "base64");
    const fp = path.join(dir, path.basename(filename || "file.bin"));
    fs.writeFileSync(fp, buf);
    return fp;
  } catch (_e) {
    return null;
  }
}

/**
 * @param {string} intakeId
 * @param {Array<{ filename?: string, path?: string, mimeType?: string, size?: number, base64?: string }>} attachments
 */
function linkAttachmentsToIntake(intakeId, attachments) {
  const id = String(intakeId || "").trim();
  const base = path.join(process.cwd(), "uploads", "intake", id.replace(/[^a-zA-Z0-9-_]/g, ""));
  const out = [];
  const list = Array.isArray(attachments) ? attachments : [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    let fp = a.path ? String(a.path) : "";
    if (!fp && a.base64 && a.filename) {
      fp = safeWriteBase64(base, a.filename, a.base64) || "";
    }
    if (fp && fs.existsSync(fp)) {
      try {
        const st = fs.statSync(fp);
        out.push({
          filename: path.basename(fp),
          path: fp,
          mimeType: a.mimeType || "application/octet-stream",
          size: st.size,
          kind: guessKind(fp, a.mimeType),
        });
      } catch (_e) {
        /* skip */
      }
    }
  }
  return out;
}

/**
 * Copy intake attachments to job upload folder and return paths for registerArtFile.
 */
function promoteAttachmentsToJob(intakeId, jobId, linked) {
  const jid = String(jobId || "").replace(/[^a-zA-Z0-9-_]/g, "");
  const destDir = path.join(process.cwd(), "uploads", jid);
  const promoted = [];
  const list = Array.isArray(linked) ? linked : [];
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  } catch (_e) {
    return promoted;
  }
  for (const a of list) {
    if (!a || !a.path) continue;
    try {
      const base = path.basename(a.path);
      const dest = path.join(destDir, `${Date.now().toString(36)}-${base}`);
      fs.copyFileSync(a.path, dest);
      promoted.push({ ...a, path: dest, filename: path.basename(dest) });
    } catch (_e) {
      /* skip */
    }
  }
  return promoted;
}

module.exports = {
  detectArtFromIntake,
  linkAttachmentsToIntake,
  promoteAttachmentsToJob,
  guessKind,
};
