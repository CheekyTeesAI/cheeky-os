/**
 * Cheeky OS — Structured logger with in-memory buffer.
 * Uses winston for JSON-formatted output with timestamps.
 * Keeps a rolling buffer of the last 20 entries for /activity endpoint.
 *
 * @module cheeky-os/utils/logger
 */

const { createLogger, format, transports } = require("winston");

/** Rolling in-memory buffer — max 20 entries for quick retrieval. */
const buffer = [];
const MAX_BUFFER = 20;

/**
 * Custom format that pushes each log entry into the in-memory buffer.
 */
const bufferTransport = format((info) => {
  buffer.push({
    level: info.level,
    message: info.message,
    timestamp: info.timestamp || new Date().toISOString(),
  });
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }
  return info;
});

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    bufferTransport(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
    }),
  ],
});

module.exports = { logger, buffer };
