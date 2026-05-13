const http = require("http");

const routesToTest = [
  "/api/launch/readiness",
  "/api/dashboard/summary",
  "/api/system/health",
];

const baseUrl = process.env.SMOKE_TEST_BASE_URL || "http://localhost:3000";
const results = [];

const testEndpoint = (route) => {
  return new Promise((resolve) => {
    const url = `${baseUrl}${route}`;
    http
      .get(url, (res) => {
        let rawData = "";
        res.on("data", (chunk) => (rawData += chunk));
        res.on("end", () => {
          results.push({
            route,
            statusCode: res.statusCode,
            response: rawData.substring(0, 100), // Capture a snippet only
          });
          resolve();
        });
      })
      .on("error", (err) => {
        results.push({
          route,
          statusCode: "ERROR",
          error: err.message,
        });
        resolve();
      });
  });
};

const runSmokeTests = async () => {
  console.log("Running smoke tests on endpoints:", routesToTest);

  for (const route of routesToTest) {
    await testEndpoint(route);
  }

  console.log("Smoke Test Results:", JSON.stringify(results, null, 2));
};

runSmokeTests();
