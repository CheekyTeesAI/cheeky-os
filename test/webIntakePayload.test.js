const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildWebIntakeBody } = require("../src/services/webIntakePayload");

describe("buildWebIntakeBody", () => {
  it("preserves structured store order fields when no free-text body is provided", () => {
    const body = buildWebIntakeBody({
      customerName: "Sam Customer",
      email: "sam@example.com",
      phone: "555-123-4567",
      product: "Uniform Order: 2x Polo (SDPC-P01) Size: L",
      quantity: 2,
      notes: "Store: sdpc | Est. subtotal: $50.00",
    });

    assert.match(body, /Product: Uniform Order: 2x Polo \(SDPC-P01\) Size: L/);
    assert.match(body, /Quantity: 2/);
    assert.match(body, /Notes: Store: sdpc \| Est\. subtotal: \$50\.00/);
  });

  it("keeps existing message text while appending structured fields", () => {
    const body = buildWebIntakeBody({
      message: "Please confirm this uniform request.",
      product: "Uniform Order: 1x Jacket (SDPC-J01) Size: M",
      quantity: "1",
    });

    assert.equal(
      body,
      [
        "Please confirm this uniform request.",
        "Product: Uniform Order: 1x Jacket (SDPC-J01) Size: M",
        "Quantity: 1",
      ].join("\n")
    );
  });
});
