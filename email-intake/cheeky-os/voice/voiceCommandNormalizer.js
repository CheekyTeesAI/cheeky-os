"use strict";

const FILLERS = /\b(um+|uh+|like|basically|you know|okay|please|thanks|thank you|could you|would you)\b/gi;

/**
 * Normalize STT-ish text → compact operator phrase.
 */
function normalizeVoiceCommand(rawText) {
  try {
    const text = String(rawText || "").replace(/\s+/g, " ").trim();
    const unstuffed = text.replace(FILLERS, " ").replace(/\s+/g, " ").trim();
    const lower = unstuffed.toLowerCase();
    return {
      normalizedText: unstuffed.slice(0, 2000),
      lowerPreview: lower.slice(0, 400),
      wasEmpty: unstuffed.length === 0,
    };
  } catch (_e) {
    return {
      normalizedText: String(rawText || "").slice(0, 2000),
      lowerPreview: "",
      wasEmpty: true,
    };
  }
}

module.exports = { normalizeVoiceCommand };
