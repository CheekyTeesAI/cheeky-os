"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBusiness = runBusiness;
const response_1 = require("../../command-layer/utils/response");
const businessState_service_1 = require("../services/businessState.service");
async function runBusiness(_req, res) {
    try {
        const data = await (0, businessState_service_1.getBusinessState)();
        return res.json((0, response_1.successResponse)(data, "Business state loaded"));
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Business state unavailable",
            data: null
        });
    }
}
