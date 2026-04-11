/**
 * Square API Connectivity Test — Cheeky Tees
 * Tests live connection to Square using raw fetch (no SDK).
 * Reads SQUARE_ACCESS_TOKEN from .env and calls GET /v2/locations.
 *
 * Run as: node test-square.js
 *
 * @module test-square
 */

require("dotenv").config();

/**
 * Test Square API connectivity by listing locations.
 * Prints each location name and ID on success, or the error on failure.
 */
async function testSquare() {
  console.log("\uD83D\uDD0D Testing Square connection...\n");

  var token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    console.log("\u274C Square Error");
    console.log("   SQUARE_ACCESS_TOKEN is not set in .env");
    return;
  }

  try {
    var res = await fetch("https://connect.squareup.com/v2/locations", {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      var data = await res.json();
      var locations = data.locations || [];

      console.log("\u2705 Square Connected!");
      console.log("   Locations found: " + locations.length + "\n");

      for (var i = 0; i < locations.length; i++) {
        console.log("   - " + locations[i].name + " (ID: " + locations[i].id + ")");
      }
    } else {
      var body = await res.text();
      console.log("\u274C Square Error");
      console.log("   Status: " + res.status);
      console.log("   Response: " + body);
    }
  } catch (err) {
    console.log("\u274C Square Error");
    console.log("   " + (err.message || err));
  }
}

testSquare();
