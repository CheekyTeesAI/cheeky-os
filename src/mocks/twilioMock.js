function sendSms(message) {
  return {
    success: true,
    provider: "twilio-mock",
    sid: `SM${Math.random().toString(16).slice(2, 18)}`,
    to: message && message.to ? message.to : "+18644983475",
    body: message && message.body ? message.body : "",
    queuedAt: new Date().toISOString(),
  };
}

module.exports = {
  sendSms,
};
