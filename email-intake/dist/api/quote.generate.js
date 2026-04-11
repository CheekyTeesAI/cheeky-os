"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuote = generateQuote;
async function generateQuote(req, res) {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                error: "Missing items"
            });
        }
        function getMargin(qty) {
            if (qty === 1)
                return 2.0;
            if (qty === 2)
                return 1.5;
            if (qty <= 5)
                return 1.25;
            if (qty <= 11)
                return 1.0;
            if (qty <= 17)
                return 0.75;
            if (qty <= 23)
                return 0.625;
            if (qty <= 49)
                return 0.5;
            if (qty <= 99)
                return 0.45;
            if (qty <= 249)
                return 0.4;
            if (qty <= 499)
                return 0.3;
            return 0.2;
        }
        let total = 0;
        items.forEach((item) => {
            const lower = item.toLowerCase();
            // extract quantity
            const qtyMatch = item.match(/\d+/);
            const qty = qtyMatch ? parseInt(qtyMatch[0]) : 1;
            // base garment costs
            let blankCost = 4;
            if (lower.includes("hoodie"))
                blankCost = 12;
            // print cost assumptions (front + back)
            let printCost = 6;
            const baseCost = blankCost + printCost;
            const margin = getMargin(qty);
            const sellPricePerUnit = baseCost * (1 + margin);
            total += sellPricePerUnit * qty;
        });
        total = Math.round(total);
        const quote = {
            id: "quote_" + Date.now(),
            items,
            total,
            status: "DRAFT",
            createdAt: new Date().toISOString()
        };
        return res.json({
            success: true,
            quote
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: "Quote generation failed"
        });
    }
}
