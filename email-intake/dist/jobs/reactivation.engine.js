"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReactivationEngine = runReactivationEngine;
async function runReactivationEngine(req, res) {
    try {
        // MOCK DATA (replace later with Square)
        const customers = [
            {
                name: "John HVAC",
                email: "john@hvac.com",
                lastOrderDaysAgo: 120,
                totalSpent: 3200
            },
            {
                name: "School Booster Club",
                email: "school@test.com",
                lastOrderDaysAgo: 200,
                totalSpent: 8400
            },
            {
                name: "New Customer",
                email: "new@test.com",
                lastOrderDaysAgo: 10,
                totalSpent: 200
            }
        ];
        // TARGET: inactive customers
        const targets = customers.filter(c => c.lastOrderDaysAgo > 60);
        const outreach = targets.map(c => ({
            name: c.name,
            email: c.email,
            message: `Hey ${c.name}, we’ve got some new print options and pricing — want me to put together something fresh for you?`,
            priority: c.totalSpent > 5000 ? "HIGH" : "MEDIUM"
        }));
        return res.json({
            success: true,
            totalCustomers: customers.length,
            targets: targets.length,
            outreach
        });
    }
    catch (err) {
        console.error("Reactivation failed", err);
        return res.status(500).json({
            success: false,
            error: "Reactivation failed"
        });
    }
}
