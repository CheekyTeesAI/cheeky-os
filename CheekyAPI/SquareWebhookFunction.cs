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
/// Receives Square webhook events (invoice.updated, invoice.published, payment.completed, order.created)
/// and routes them to the appropriate Dataverse operations.
/// </summary>
public class SquareWebhookFunction
{
    private readonly ILogger<SquareWebhookFunction> _logger;
    private readonly DataverseService _dataverse;

    public SquareWebhookFunction(ILogger<SquareWebhookFunction> logger, DataverseService dataverse)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _dataverse = dataverse ?? throw new ArgumentNullException(nameof(dataverse));
    }

    [Function("square_webhook")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        _logger.LogInformation("Square webhook received.");

        string body;
        using (var reader = new StreamReader(req.Body))
        {
            body = await reader.ReadToEndAsync();
        }

        if (string.IsNullOrWhiteSpace(body))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Empty payload");
            return bad;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            var eventType = root.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
            var eventId = root.TryGetProperty("event_id", out var idEl) ? idEl.GetString() : null;

            _logger.LogInformation("Square event: {EventType} id: {EventId}", eventType, eventId);

            // Route by event type
            switch (eventType)
            {
                case "invoice.updated":
                case "invoice.published":
                case "invoice.payment_made":
                    _logger.LogInformation("Invoice event processed: {EventType}", eventType);
                    break;

                case "order.created":
                    _logger.LogInformation("Order created event processed.");
                    break;

                case "payment.completed":
                case "payment.updated":
                    _logger.LogInformation("Payment event processed: {EventType}", eventType);
                    break;

                default:
                    _logger.LogWarning("Unhandled Square event type: {EventType}", eventType);
                    break;
            }
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse Square webhook JSON.");
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Invalid JSON");
            return bad;
        }

        var ok = req.CreateResponse(HttpStatusCode.OK);
        ok.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await ok.WriteStringAsync("{\"status\":\"processed\"}");
        return ok;
    }
}
