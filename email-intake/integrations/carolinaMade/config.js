// Carolina Made SOAP Adapter Config
// Phase 3 - Friday Night Hard Build
const config = {
  soapUrl: process.env.CAROLINA_MADE_SOAP_URL,
  username: process.env.CAROLINA_MADE_SOAP_USERNAME,
  password: process.env.CAROLINA_MADE_SOAP_PASSWORD,
  mockMode: !process.env.CAROLINA_MADE_SOAP_URL || process.env.CAROLINA_MADE_MOCK_MODE === 'true'
};

module.exports = config;
module.exports.getStatus = () => ({
  configured: !!config.soapUrl,
  mockMode: config.mockMode
});