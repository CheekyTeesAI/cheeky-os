"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.route = route;
const sales_engine_1 = require("../engines/sales.engine");
/**
 * Routes validated brain intent to the appropriate engine.
 */
async function route(intent, payload) {
    switch (intent) {
        case "CREATE_INVOICE":
            return (0, sales_engine_1.runCreateInvoice)(payload);
        default:
            throw new Error(`Unsupported intent: ${intent}`);
    }
}
