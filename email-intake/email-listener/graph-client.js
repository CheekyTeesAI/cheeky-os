const https = require("https");
const { ClientSecretCredential } = require("@azure/identity");

https
  .get("https://login.microsoftonline.com", (r) => {
    console.log("[GRAPH-TEST] Reached login.microsoft:", r.statusCode);
  })
  .on("error", (e) => {
    console.error("[GRAPH-TEST] Cannot reach login.microsoft:", e.message);
  });

async function getAccessToken() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const tokenResponse = await credential.getToken(
    "https://graph.microsoft.com/.default"
  );
  return tokenResponse.token;
}

module.exports = { getAccessToken };
