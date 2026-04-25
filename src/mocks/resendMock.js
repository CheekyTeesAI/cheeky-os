function sendEmail(message) {
  return {
    success: true,
    provider: "resend-mock",
    id: `re_mock_${Date.now()}`,
    message: {
      to: message && message.to ? message.to : "owner@cheekyteesllc.com",
      subject: message && message.subject ? message.subject : "Mock Email",
      text: message && message.text ? message.text : "",
    },
    queuedAt: new Date().toISOString(),
  };
}

module.exports = {
  sendEmail,
};
