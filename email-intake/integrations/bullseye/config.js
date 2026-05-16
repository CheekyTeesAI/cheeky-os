// Bullseye Integration Config
// Additive - for screenprint and embroidery work orders
const config = {
  email: process.env.BULLSEYE_EMAIL || 'orders@bullseyescreenprinting.com', // placeholder
  name: 'Bullseye Screen Printing',
  workOrderTemplate: 'bullseye-work-order',
  // Add more as needed
};

module.exports = config;
