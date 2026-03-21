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
/// Order stage engine - validates and advances order through stages:
/// Intake -> Quote Sent -> Deposit Paid -> Production Ready -> Printing -> Completed
/// POST /api/advance_order_stage { "orderId": "...", "currentStage": "...", "targetStage": "..." }
/// </summary>
public class OrderStageFunction
{
    private static readonly string[] StageOrder = new[]
    {
        "Intake", "Quote Sent", "Deposit Paid", "Production Ready", "Printing", "Completed"
    };

    private readonly ILogger<OrderStageFunction> _logger;

    public OrderStageFunction(ILogger<OrderStageFunction> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [Function("advance_order_stage")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("Order stage advance requested.");

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

            string orderId = root.TryGetProperty("orderId", out var idEl) ? idEl.GetString() ?? "" : "";
            string currentStage = root.TryGetProperty("currentStage", out var curEl) ? curEl.GetString() ?? "" : "";
            string targetStage = root.TryGetProperty("targetStage", out var tgtEl) ? tgtEl.GetString() : null;

            int currentIndex = Array.IndexOf(StageOrder, currentStage);
            if (currentIndex < 0)
            {
                return await WriteResponse(req, HttpStatusCode.OK, new
                {
                    success = false,
                    reason = $"Unknown current stage: {currentStage}",
                    validStages = StageOrder,
                    orderId
                });
            }

            // If no target, advance to next stage
            if (string.IsNullOrEmpty(targetStage))
            {
                if (currentIndex >= StageOrder.Length - 1)
                {
                    return await WriteResponse(req, HttpStatusCode.OK, new
                    {
                        success = false,
                        reason = "Order is already at final stage (Completed)",
                        currentStage,
                        orderId
                    });
                }
                targetStage = StageOrder[currentIndex + 1];
            }

            int targetIndex = Array.IndexOf(StageOrder, targetStage);
            if (targetIndex < 0)
            {
                return await WriteResponse(req, HttpStatusCode.OK, new
                {
                    success = false,
                    reason = $"Unknown target stage: {targetStage}",
                    validStages = StageOrder,
                    orderId
                });
            }

            if (targetIndex < currentIndex)
            {
                return await WriteResponse(req, HttpStatusCode.OK, new
                {
                    success = false,
                    reason = $"Cannot move backward from {currentStage} to {targetStage}",
                    orderId
                });
            }

            _logger.LogInformation("Order {OrderId}: {From} -> {To}", orderId, currentStage, targetStage);

            return await WriteResponse(req, HttpStatusCode.OK, new
            {
                success = true,
                orderId,
                previousStage = currentStage,
                newStage = targetStage,
                stageIndex = targetIndex,
                isComplete = (targetStage == "Completed")
            });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse order stage request.");
            return await WriteResponse(req, HttpStatusCode.BadRequest, new { error = "Invalid JSON" });
        }
    }

    [Function("get_order_stages")]
    public async Task<HttpResponseData> GetStages(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        return await WriteResponse(req, HttpStatusCode.OK, new
        {
            stages = StageOrder,
            boardColumns = new[] { "Production Ready", "Printing", "QC", "Ready for Pickup" },
            productionTypes = new[] { "DTG", "Screen Print", "DTF", "Embroidery", "Vendor" }
        });
    }

    private static async Task<HttpResponseData> WriteResponse(HttpRequestData req, HttpStatusCode status, object payload)
    {
        var resp = req.CreateResponse(status);
        resp.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await resp.WriteStringAsync(JsonSerializer.Serialize(payload));
        return resp;
    }
}
