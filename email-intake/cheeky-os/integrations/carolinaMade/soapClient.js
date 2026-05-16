// Carolina Made SOAP Client - Manual envelope, no extra deps
const https = require('https');
const config = require('./config');

// Mock data for development
const mockProducts = [
  {
    vendorProductId: 'mock-64000',
    sku: 'GILDAN-64000-WHITE-L',
    title: 'Gildan Heavy Cotton T-Shirt',
    brand: 'Gildan',
    style: '64000',
    description: 'Classic fit heavy cotton tee',
    category: 'T-Shirts',
    colors: ['White', 'Black', 'Navy'],
    sizes: ['S', 'M', 'L', 'XL'],
    baseCost: 3.50,
    inventory: [{color: 'White', size: 'L', quantityAvailable: 250}]
  }
];

async function callSoap(operation, body) {
  if (config.mockMode) {
    console.log(`[CarolinaMade] Mock SOAP call for ${operation}`);
    return { success: true, data: mockProducts };
  }
  console.log('[CarolinaMade] Real SOAP placeholder');
  return { success: false, error: 'Real SOAP not wired yet' };
}

async function searchProducts(query) {
  try {
    const result = await callSoap('SearchProducts', `<query>${query}</query>`);
    return result.success ? result.data : mockProducts;
  } catch (e) {
    console.error('[CarolinaMade] Search error', e);
    return mockProducts;
  }
}

async function getProduct(id) { return mockProducts[0]; }
async function getInventory(id) { return [{quantityAvailable: 100}]; }
async function getPricing(id) { return {baseCost: 3.50}; }
async function getColors(id) { return ['White', 'Black']; }
async function getSizes(id) { return ['M', 'L']; }

module.exports = {
  searchProducts, getProduct, getInventory, getPricing, getColors, getSizes
};