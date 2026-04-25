function appendAuditLog(entry) {
  return {
    success: true,
    reason: "mock_onedrive",
    stored: "mock",
    entry: {
      ...entry,
      mockStoredAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  appendAuditLog,
};
