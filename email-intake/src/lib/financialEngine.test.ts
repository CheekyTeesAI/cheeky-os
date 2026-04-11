import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDeposit,
  calculateMargin,
  calculatePPH,
  evaluateOrder,
} from "./financialEngine";

describe("financialEngine", () => {
  it("calculateMargin returns (revenue - cost) / revenue", () => {
    assert.equal(calculateMargin(1000, 400), 0.6);
    assert.ok(Number.isNaN(calculateMargin(0, 100)));
  });

  it("calculatePPH returns profit / laborHours", () => {
    assert.equal(calculatePPH(500, 5), 100);
    assert.ok(Number.isNaN(calculatePPH(100, 0)));
  });

  it("low margin fails evaluateOrder", () => {
    const r = evaluateOrder({
      revenue: 500,
      cost: 400,
      laborHours: 5,
      quantity: 24,
      method: "SCREEN",
      blankCost: 50,
    });
    assert.equal(r.approved, false);
    assert.ok(r.errors.some((e) => e.includes("margin")));
  });

  it("low PPH fails evaluateOrder", () => {
    const r = evaluateOrder({
      revenue: 600,
      cost: 200,
      laborHours: 20,
      quantity: 24,
      method: "SCREEN",
      blankCost: 50,
    });
    assert.equal(r.approved, false);
    assert.ok(r.errors.some((e) => e.includes("labor hour")));
  });

  it("low quantity fails for screen print", () => {
    const r = evaluateOrder({
      revenue: 600,
      cost: 200,
      laborHours: 4,
      quantity: 12,
      method: "SCREEN",
      blankCost: 50,
    });
    assert.equal(r.approved, false);
    assert.ok(r.errors.some((e) => e.includes("screen")));
  });

  it("deposit covers blank cost and rounds up to $25", () => {
    assert.equal(calculateDeposit(400, 250), 250);
    assert.equal(calculateDeposit(300, 190), 200);
    assert.equal(calculateDeposit(500, 123), 250);
  });

  it("valid order passes all rules", () => {
    const r = evaluateOrder({
      revenue: 600,
      cost: 200,
      laborHours: 4,
      quantity: 24,
      method: "SCREEN",
      blankCost: 100,
    });
    assert.equal(r.approved, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.margin >= 0.45);
    assert.ok(r.pph >= 50);
    assert.equal(r.depositRequired, 300);
  });
});
