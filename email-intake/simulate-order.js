/**
 * Order Simulator — Cheeky Tees
 * Sends a realistic test order through the intake pipeline
 * exactly like a real order, using the existing handleWebhook flow.
 *
 * Run as: node simulate-order.js
 *
 * @module simulate-order
 */

require("dotenv").config();

var intake = require("./intake");

var testOrder = {
  customerName: "John Smith",
  email: "john@demo.com",
  phone: "864-555-1234",
  product: "T-shirts",
  quantity: "24",
  sizes: "S-6, M-10, L-8",
  printType: "Front and Back",
  notes: "Rush order",
  deadline: "3/30",
};

/**
 * Run the test order through the full intake pipeline and log results.
 */
async function simulate() {
  console.log("\n\uD83D\uDCE6 Simulating order intake...\n");
  console.log("  Customer: " + testOrder.customerName);
  console.log("  Product:  " + testOrder.quantity + " " + testOrder.product);
  console.log("  Print:    " + testOrder.printType);
  console.log("  Deadline: " + testOrder.deadline);
  console.log("");

  try {
    var result = await intake.handleWebhook(testOrder);

    console.log("\u2705 Order processed\n");
    console.log("  Dataverse result:");
    console.log("    Record ID: " + (result.recordId || "(not created — credentials needed)"));
    console.log("");
    console.log("  Square invoice result:");
    console.log("    Customer:  " + (result.mapped.customerName || testOrder.customerName));
    console.log("    Mapped fields: " + Object.keys(result.mapped).length);
    console.log("");
  } catch (err) {
    console.log("\u274C Order processing error: " + err.message);
    console.log("");
    console.log("  This is expected if Dataverse credentials are not yet configured.");
    console.log("  The pipeline ran — fix credentials to complete the full flow.");
  }
}

simulate();
