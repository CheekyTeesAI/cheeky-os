/**
 * Decide ship-to for PO / direct-ship.
 */

const SHOP = {
  shipToName: "Cheeky Tees",
  address1: "104 Trade Street",
  city: "Fountain Inn",
  state: "SC",
  zip: "29644",
};

function bullseyeAddress() {
  const line = String(process.env.BULLSEYE_SHIP_ADDRESS || "").trim();
  if (line) {
    const parts = line.split("|");
    return {
      shipToName: String(process.env.BULLSEYE_SHIP_NAME || "Bullseye").trim(),
      address1: parts[0] || "See vendor",
      city: parts[1] || "",
      state: parts[2] || "",
      zip: parts[3] || "",
    };
  }
  return {
    shipToName: "Bullseye (configure BULLSEYE_SHIP_ADDRESS)",
    address1: "—",
    city: "",
    state: "",
    zip: "",
  };
}

function determineShipTo(po, vendor, opts) {
  const v = vendor || {};
  const direct = Boolean(opts && opts.directShipToBullseye);
  const anyBullseye = Boolean(opts && opts.anyLinkedJobBullseye);
  const canDrop = v.supportsDirectShip !== false;

  if (direct) {
    if (canDrop) {
      const b = bullseyeAddress();
      return {
        ...b,
        reason: "Explicit direct-ship to Bullseye production partner",
      };
    }
    return {
      ...SHOP,
      reason: "Direct-ship requested but supplier cannot drop-ship to third party — receive at shop",
    };
  }

  if (anyBullseye && canDrop) {
    const b = bullseyeAddress();
    return {
      ...b,
      reason: "Linked job(s) route to Bullseye — ship blanks to production partner",
    };
  }

  if (anyBullseye && !canDrop) {
    return {
      ...SHOP,
      reason: "Linked Bullseye job(s), but this supplier does not support drop-ship — receive at shop for forwarding",
    };
  }

  return {
    ...SHOP,
    reason: "Default — ship blanks to Cheeky Tees shop",
  };
}

module.exports = {
  determineShipTo,
  bullseyeAddress,
  SHOP,
};
