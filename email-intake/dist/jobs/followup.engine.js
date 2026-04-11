"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFollowupEngine = runFollowupEngine;
const DRY_RUN = process.env.FOLLOWUP_DRY_RUN !== "false";
async function runFollowupEngine(req, res) {
    try {
        // MOCK: replace later with DB / Square
        const mockQuotes = [
            {
                id: "q1",
                customer: "Test Customer",
                email: "test@test.com",
                total: 250,
                createdAt: Date.now() - 1000 * 60 * 60 * 48 // 48 hours old
            }
        ];
        const now = Date.now();
        const staleQuotes = mockQuotes.filter(q => {
            const ageHours = (now - q.createdAt) / (1000 * 60 * 60);
            return ageHours > 24;
        });
        const followups = staleQuotes.map(q => ({
            quoteId: q.id,
            action: "FOLLOW_UP",
            message: `Hey ${q.customer}, just checking in on your order. We can get this started today.`,
            customer: q.customer,
            email: q.email,
            amount: q.total
        }));
        for (const f of followups) {
            if (DRY_RUN) {
                console.log("DRY RUN — WOULD SEND:", f);
                continue;
            }
            try {
                const response = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        from: "Cheeky Tees <orders@cheekyteesllc.com>",
                        to: [f.email],
                        subject: "Quick follow-up on your order 👕",
                        html: `
          <p>Hey ${f.customer},</p>
          <p>Just checking in on your order — we can get this started today.</p>
          <p><strong>Total:</strong> $${f.amount}</p>
          <p>Let me know if you want to move forward 👍</p>
        `
                    })
                });
                const data = await response.json();
                console.log("EMAIL SENT:", data);
            }
            catch (err) {
                console.error("EMAIL FAILED:", err);
            }
        }
        return res.json({
            success: true,
            dryRun: DRY_RUN,
            sent: DRY_RUN ? 0 : followups.length,
            followups
        });
    }
    catch (err) {
        console.error("Followup engine failed", err);
        return res.status(500).json({
            success: false,
            error: "Followup failed"
        });
    }
}
