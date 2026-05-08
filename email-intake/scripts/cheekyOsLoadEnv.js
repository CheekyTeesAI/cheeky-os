/**
 * Preload for `npm start`: apply email-intake/.env with override so PORT/CHEEKY_OS_PORT
 * match the file even when the shell already exported a different PORT (e.g. 3001).
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});
