const { ClientSecretCredential } = require("@azure/identity");

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
