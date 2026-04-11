'use strict';
const { logger } = require('../utils/logger');
function parseSquareEvent(rawBody) {
    const INVALID = {
        valid: false,
        type: '',
        paymentStatus: '',
        paymentId: '',
        amountMoney: { amount: 0, currency: 'USD' },
        customerId: null,
        note: null,
        rawPayload: rawBody,
        idempotencyKey: ''
    };
    try {
        const body = rawBody;
        const type = body?.type || '';
        const payment = body?.data?.object?.payment || {};
        const paymentStatus = payment?.status || '';
        const paymentId = payment?.id || '';
        const amount = payment?.amount_money?.amount || 0;
        const currency = payment?.amount_money?.currency || 'USD';
        const customerId = payment?.customer_id || null;
        const note = payment?.note || null;
        if (type !== 'payment.updated' || paymentStatus !== 'COMPLETED') {
            logger.info('EventTruth: ignored event', { type, paymentStatus });
            return { ...INVALID, type, paymentStatus };
        }
        if (!paymentId) {
            logger.warn('EventTruth: missing paymentId');
            return INVALID;
        }
        const idempotencyKey = paymentId + ':' + paymentStatus;
        const event = {
            valid: true,
            type,
            paymentStatus,
            paymentId,
            amountMoney: { amount, currency },
            customerId,
            note,
            rawPayload: rawBody,
            idempotencyKey
        };
        logger.info('VALID EVENT OBJECT', {
            paymentId,
            type,
            paymentStatus,
            idempotencyKey
        });
        return event;
    }
    catch (err) {
        logger.error('EventTruth parse error', { err });
        return INVALID;
    }
}
module.exports = { parseSquareEvent };
