"use strict";

const { Resend } = require("resend");
const twilio = require("twilio");

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendEmailReal({ to, subject, html, text }) {
  const resend = getResendClient();
  if (!resend) throw new Error("RESEND_NOT_CONFIGURED");

  const from = process.env.FROM_EMAIL;
  if (!from) throw new Error("FROM_EMAIL_NOT_CONFIGURED");

  return resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
  });
}

async function sendSmsReal({ to, body }) {
  const client = getTwilioClient();
  if (!client) throw new Error("TWILIO_NOT_CONFIGURED");

  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER_NOT_CONFIGURED");

  return client.messages.create({
    body,
    from,
    to,
  });
}

module.exports = {
  sendEmailReal,
  sendSmsReal,
};
