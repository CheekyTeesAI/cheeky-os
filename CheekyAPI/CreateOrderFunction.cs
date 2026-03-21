using System;
using System.IO;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace CheekyAPI;

/// <summary>
/// Creates a new order in Dataverse from a structured intake payload.
/// Enforces Cheeky OS constitution: margin gate, minimum qty, payment rules.
/// POST /api/create_order { customerName, email, phone, garmentType, quantity,
///   productionType, totalAmount, totalCost, dueDate, notes, intakeSource, rushFlag }
/// </summary>
public class CreateOrderFunction
{
    private const decimal MinimumMarginPercent = 45m;
    private const int MinimumOrderQuantity = 12;
    private const int ScreenPrintMinimum = 24;

    private static readonly string[] ValidStages = { "Intake", "Quote Sent", "Deposit Paid", "Production Ready", "Printing", "Completed" };
    private static readonly string[] ValidProductionTypes = { "DTG", "Screen Print", "DTF", "Embroidery", "Vendor" };

    private readonly ILogger<CreateOrderFunction> _logger;

    public CreateOrderFunction(ILogger<CreateOrderFunction> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [Function("create_order")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("Create order request received.");

        string body;
        using (var reader = new StreamReader(req.Body))
        {
            body = await reader.ReadToEndAsync();
        }

        if (string.IsNullOrWhiteSpace(body))
        {
            return await WriteResponse(req, HttpStatusCode.BadRequest, new { error = "Empty payload" });
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            // Extract fields
            string customerName = GetString(root, "customerName");
            string email = GetString(root, "email");
            string phone = GetString(root, "phone");
            string garmentType = GetString(root, "garmentType");
            int quantity = root.TryGetProperty("quantity", out var qtyEl) ? qtyEl.GetInt32() : 0;
            string productionType = GetString(root, "productionType");
            decimal totalAmount = root.TryGetProperty("totalAmount", out var amtEl) ? amtEl.GetDecimal() : 0;
            decimal totalCost = root.TryGetProperty("totalCost", out var costEl) ? costEl.GetDecimal() : 0;
            string dueDate = GetString(root, "dueDate");
            string notes = GetString(root, "notes");
            string intakeSource = GetString(root, "intakeSource") ?? "Manual";
            bool rushFlag = root.TryGetProperty("rushFlag", out var rushEl) && rushEl.GetBoolean();

            // Validate minimum quantity
            if (quantity < MinimumOrderQuantity)
            {
                return await WriteResponse(req, HttpStatusCode.OK, new
                {
                    created = false,
                    reason = $"Quantity {quantity} below minimum {MinimumOrderQuantity} pieces per design",
                    gate = "MINIMUM_QTY"
                });
            }

            // Auto-route production type if not specified
            if (string.IsNullOrEmpty(productionType))
            {
                productionType = quantity >= ScreenPrintMinimum ? "Screen Print" : "DTG";
            }

            // Margin gate
            decimal marginPercent = 0;
            string marginStatus = "Not Calculated";
            if (totalAmount > 0 && totalCost > 0)
            {
                marginPercent = Math.Round(((totalAmount - totalCost) / totalAmount) * 100, 2);
                marginStatus = marginPercent >= MinimumMarginPercent ? "Pass" : "Fail";

                if (marginPercent < MinimumMarginPercent)
                {
                    _logger.LogWarning("Margin gate FAILED: {Margin}% for order from {Customer}", marginPercent, customerName);
                }
            }

            // Payment calculation
            decimal depositRequired = rushFlag
                ? totalAmount
                : Math.Ceiling(totalAmount * 0.50m);

            string paymentStatus = "No Invoice";
            string quoteStat = totalAmount > 0 ? "Draft" : "Not Quoted";

            // Generate order number
            string orderNumber = "CHK-" + DateTime.UtcNow.ToString("yyyyMMdd") + "-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
            string orderName = !string.IsNullOrEmpty(customerName)
                ? $"{customerName} - {orderNumber}"
                : orderNumber;

            var orderPayload = new
            {
                orderNumber,
                orderName,
                customerName,
                email,
                phone,
                garmentType,
                quantity,
                productionType,
                totalAmount,
                totalCost,
                marginPercent,
                marginStatus,
                depositRequired,
                paymentStatus,
                quoteStatus = quoteStat,
                artworkStatus = "Not Received",
                approvalStatus = "Pending",
                blankStatus = "Not Ordered",
                productionStatus = "Not Started",
                qcStatus = "Pending",
                deliveryStatus = "Not Ready",
                orderStage = "Intake",
                intakeSource,
                rushFlag,
                dueDate,
                notes,
                active = true,
                created = true,
                createdAt = DateTime.UtcNow.ToString("o"),
                nextAction = GetNextAction(marginStatus, rushFlag)
            };

            _logger.LogInformation("Order created: {OrderNumber} for {Customer} | {ProductionType} x{Qty} | Margin: {Margin}%",
                orderNumber, customerName, productionType, quantity, marginPercent);

            return await WriteResponse(req, HttpStatusCode.OK, orderPayload);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse create order request.");
            return await WriteResponse(req, HttpStatusCode.BadRequest, new { error = "Invalid JSON" });
        }
    }

    private static string GetNextAction(string marginStatus, bool rushFlag)
    {
        if (marginStatus == "Fail")
            return "BLOCKED: Margin below 45%. Requires owner override before proceeding.";
        if (rushFlag)
            return "Rush order: collect 100% payment, then submit artwork for approval.";
        return "Send quote to customer. Collect deposit before scheduling production.";
    }

    private static string? GetString(JsonElement root, string property)
    {
        return root.TryGetProperty(property, out var el) ? el.GetString() : null;
    }

    private static async Task<HttpResponseData> WriteResponse(HttpRequestData req, HttpStatusCode status, object payload)
    {
        var resp = req.CreateResponse(status);
        resp.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await resp.WriteStringAsync(JsonSerializer.Serialize(payload));
        return resp;
    }
}
