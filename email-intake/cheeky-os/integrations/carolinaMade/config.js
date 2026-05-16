// Carolina Made SOAP Integration Config
// Additive only - follows Cheeky OS rules
const config = {
  soapUrl: process.env.CAROLINA_MADE_SOAP_URL,
  username: process.env.CAROLINA_MADE_SOAP_USERNAME,
  password: process.env.CAROLINA_MADE_SOAP_PASSWORD,
  customerId: process.env.CAROLINA_MADE_CUSTOMER_ID,
  mockMode: !process.env.CAROLINA_MADE_SOAP_URL
};

module.exports = config;

console.log('[CarolinaMade] Config loaded - Mock mode:', config.mockMode);