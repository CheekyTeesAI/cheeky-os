/** @type {import('jest').Config} */
module.exports = {
  testMatch: ["**/cheeky-os/tests/**/*.test.js"],
  testEnvironment: "node",
  verbose: true,
  forceExit: true,
  testTimeout: 10000,
};
