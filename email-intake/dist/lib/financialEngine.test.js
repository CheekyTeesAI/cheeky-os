"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const financialEngine_1 = require("./financialEngine");
(0, node_test_1.describe)("financialEngine", () => {
    (0, node_test_1.it)("calculateMargin returns (revenue - cost) / revenue", () => {
        strict_1.default.equal((0, financialEngine_1.calculateMargin)(1000, 400), 0.6);
        strict_1.default.ok(Number.isNaN((0, financialEngine_1.calculateMargin)(0, 100)));
    });
    (0, node_test_1.it)("calculatePPH returns profit / laborHours", () => {
        strict_1.default.equal((0, financialEngine_1.calculatePPH)(500, 5), 100);
        strict_1.default.ok(Number.isNaN((0, financialEngine_1.calculatePPH)(100, 0)));
    });
    (0, node_test_1.it)("low margin fails evaluateOrder", () => {
        const r = (0, financialEngine_1.evaluateOrder)({
            revenue: 500,
            cost: 400,
            laborHours: 5,
            quantity: 24,
            method: "SCREEN",
            blankCost: 50,
        });
        strict_1.default.equal(r.approved, false);
        strict_1.default.ok(r.errors.some((e) => e.includes("margin")));
    });
    (0, node_test_1.it)("low PPH fails evaluateOrder", () => {
        const r = (0, financialEngine_1.evaluateOrder)({
            revenue: 600,
            cost: 200,
            laborHours: 20,
            quantity: 24,
            method: "SCREEN",
            blankCost: 50,
        });
        strict_1.default.equal(r.approved, false);
        strict_1.default.ok(r.errors.some((e) => e.includes("labor hour")));
    });
    (0, node_test_1.it)("low quantity fails for screen print", () => {
        const r = (0, financialEngine_1.evaluateOrder)({
            revenue: 600,
            cost: 200,
            laborHours: 4,
            quantity: 12,
            method: "SCREEN",
            blankCost: 50,
        });
        strict_1.default.equal(r.approved, false);
        strict_1.default.ok(r.errors.some((e) => e.includes("screen")));
    });
    (0, node_test_1.it)("deposit covers blank cost and rounds up to $25", () => {
        strict_1.default.equal((0, financialEngine_1.calculateDeposit)(400, 250), 250);
        strict_1.default.equal((0, financialEngine_1.calculateDeposit)(300, 190), 200);
        strict_1.default.equal((0, financialEngine_1.calculateDeposit)(500, 123), 250);
    });
    (0, node_test_1.it)("valid order passes all rules", () => {
        const r = (0, financialEngine_1.evaluateOrder)({
            revenue: 600,
            cost: 200,
            laborHours: 4,
            quantity: 24,
            method: "SCREEN",
            blankCost: 100,
        });
        strict_1.default.equal(r.approved, true);
        strict_1.default.equal(r.errors.length, 0);
        strict_1.default.ok(r.margin >= 0.45);
        strict_1.default.ok(r.pph >= 50);
        strict_1.default.equal(r.depositRequired, 300);
    });
});
