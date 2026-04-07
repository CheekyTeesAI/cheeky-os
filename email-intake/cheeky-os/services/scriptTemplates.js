/**
 * Bundle 2.5 — static outreach copy (shared by /revenue/scripts, mobile, command center).
 */

function getScriptSet() {
  return {
    reactivation:
      "Hey [Name] — this is Patrick from Cheeky Tees. We’re running a production window this week and wanted to see if you need anything printed.",
    followup_invoice:
      "Hey [Name], just checking in on your invoice — we can get this moving as soon as you're ready.",
    followup_estimate:
      "Hey [Name], wanted to see if you'd like to move forward with your order.",
    new_lead:
      "Hey! We can definitely help you with that — want me to put together a quick mockup and quote?",
  };
}

module.exports = { getScriptSet };
