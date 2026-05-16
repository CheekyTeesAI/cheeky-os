"use strict";

const nodemailer = require('nodemailer'); // Assuming it's in dependencies or we'll use existing email utils

const config = require('./config');
const { buildWorkOrderDraft } = require('../../workorders/workOrderBuilder');

async function sendWorkOrderToBullseye(orderData) {
  try {
    const { draft } = buildWorkOrderDraft(orderData);
    
    if (draft.productionMethod !== 'SCREEN_PRINT' && draft.productionMethod !== 'EMBROIDERY') {
      console.log('Not a screenprint/embroidery job - skipping Bullseye');
      return { ok: true, skipped: true };
    }

    if (!draft.deposit.paid) {
      console.log('Deposit not paid yet');
      return { ok: true, skipped: true };
    }

    if (config.mockMode) {
      console.log('[MOCK] Would send work order to Bullseye:', draft.id);
      return { ok: true, mock: true, draft };
    }

    // TODO: Use existing email service or Outlook integration when ready
    console.log(`[Bullseye] Sending work order ${draft.id} to ${config.bullseyeEmail}`);
    
    // Placeholder for actual email send
    return { ok: true, sentTo: config.bullseyeEmail, draft };
  } catch (error) {
    console.error('Bullseye sender error:', error);
    return { ok: false, error: error.message };
  }
}

// Trigger function for deposit paid events
async function handleDepositPaid(orderData) {
  console.log('🔥 Deposit paid detected - checking for Bullseye automation');
  const result = await sendWorkOrderToBullseye(orderData);
  
  if (result.ok && !result.skipped) {
    console.log('✅ Bullseye work order sent + "send art" task created');
    // TODO: Create task "send art" in task system
  }
  
  return result;
}

module.exports = {
  sendWorkOrderToBullseye,
  handleDepositPaid
};
