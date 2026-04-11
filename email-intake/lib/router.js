const createHandler = require("../actions/create");
const updateHandler = require("../actions/update");
const findHandler = require("../actions/find");
const sendHandler = require("../actions/send");
const analyzeHandler = require("../actions/analyze");
const executeHandler = require("../actions/execute");

/**
 * @param {{ type: string, entity: string, intent: string, data: object, raw: string }} command
 */
async function routeCommand(command) {
  const t = String(command.type || "").toUpperCase();
  console.log("ROUTED →", t, command.entity);

  switch (t) {
    case "CREATE":
      return createHandler(command);
    case "UPDATE":
      return updateHandler(command);
    case "FIND":
      return findHandler(command);
    case "SEND":
      return sendHandler(command);
    case "ANALYZE":
      return analyzeHandler(command);
    case "EXECUTE":
    default:
      return executeHandler(command);
  }
}

module.exports = { routeCommand };
