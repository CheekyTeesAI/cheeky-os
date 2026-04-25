/**
 * Default automation flags — safe-by-default (no auto-send of risky comms / vendor).
 */
const DEFAULT_RULES = {
  intakeProcessing: true,
  productionFlow: true,
  scheduling: true,
  purchasing: true,
  customerService: true,
  communicationsAutoSafe: false,
  vendorOutboundAutoSend: false,
  squareSync: true,
  dryRun: false,
};

module.exports = {
  DEFAULT_RULES,
};
