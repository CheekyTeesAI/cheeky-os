function listOverdueInvoices() {
  const now = Date.now();
  return [
    {
      id: "INV-MOCK-4481",
      customer: "Pine Creek Church",
      amount_owed: 980,
      due_date: new Date(now - 16 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-4492",
      customer: "Metro Realty Group",
      amount_owed: 640,
      due_date: new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-4520",
      customer: "River Youth Baseball",
      amount_owed: 455,
      due_date: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

module.exports = {
  listOverdueInvoices,
};
