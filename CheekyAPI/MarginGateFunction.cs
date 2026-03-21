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
/// Validates order margin meets the 45% minimum before allowing production.
/// POST /api/margin_gate { "totalAmount": 1000, "totalCost": 500, "orderId": "..." }
/// Returns { "passed": true/false, "marginPercent": 50.0, "reason": "..." }
/// </summary>
public class MarginGateFunction
{
    private const decimal MinimumMarginPercent = 45m;

    private readonly ILogger<MarginGateFunction> _logger;

    public MarginGateFunction(ILogger<MarginGateFunction> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [Function("margin_gate")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("Margin gate check requested.");

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

            decimal totalAmount = root.TryGetProperty("totalAmount", out var amtEl) ? amtEl.GetDecimal() : 0;
            decimal totalCost = root.TryGetProperty("totalCost", out var costEl) ? costEl.GetDecimal() : 0;
            string orderId = root.TryGetProperty("orderId", out var idEl) ? idEl.GetString() ?? "" : "";

            if (totalAmount <= 0)
            {
                return await WriteResponse(req, HttpStatusCode.OK, new
                {
                    passed = false,
                    marginPercent = 0m,
                    reason = "Total amount is zero or negative",
                    flagged = true,
                    orderId
                });
            }

            decimal marginPercent = Math.Round(((totalAmount - totalCost) / totalAmount) * 100, 2);
            bool passed = marginPercent >= MinimumMarginPercent;

            string reason = passed
                ? $"Margin {marginPercent}% meets {MinimumMarginPercent}% minimum"
                : $"Margin {marginPercent}% is below {MinimumMarginPercent}% minimum - ORDER FLAGGED";

            _logger.LogInformation("Margin gate: {MarginPercent}% for order {OrderId} - {Result}",
                marginPercent, orderId, passed ? "PASSED" : "FAILED");

            return await WriteResponse(req, HttpStatusCode.OK, new
            {
                passed,
                marginPercent,
                totalAmount,
                totalCost,
                minimumRequired = MinimumMarginPercent,
                reason,
                flagged = !passed,
                orderId
            });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse margin gate request.");
            return await WriteResponse(req, HttpStatusCode.BadRequest, new { error = "Invalid JSON" });
        }
    }

    private static async Task<HttpResponseData> WriteResponse(HttpRequestData req, HttpStatusCode status, object payload)
    {
        var resp = req.CreateResponse(status);
        resp.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await resp.WriteStringAsync(JsonSerializer.Serialize(payload));
        return resp;
    }
}
