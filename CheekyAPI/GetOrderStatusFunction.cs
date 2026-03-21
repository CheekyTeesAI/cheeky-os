using System;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Xrm.Sdk;

namespace CheekyAPI;

public class GetOrderStatusFunction
{
    private readonly ILogger<GetOrderStatusFunction> _logger;
    private readonly DataverseService _dataverse;

    public GetOrderStatusFunction(ILogger<GetOrderStatusFunction> logger, DataverseService dataverse)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _dataverse = dataverse ?? throw new ArgumentNullException(nameof(dataverse));
    }

    [Function("get_order_status")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        _logger.LogInformation("Get order status request received.");

        // Parse query string for customer_email
        string customerEmail = null;
        var query = req.Url.Query;
        if (!string.IsNullOrEmpty(query))
        {
            var pairs = query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
            foreach (var kv in pairs)
            {
                var parts = kv.Split('=', 2);
                if (parts.Length == 2 && parts[0] == "customer_email")
                {
                    customerEmail = Uri.UnescapeDataString(parts[1]);
                    break;
                }
            }
        }

        if (string.IsNullOrEmpty(customerEmail))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            bad.Headers.Add("Content-Type", "text/plain; charset=utf-8");
            await bad.WriteStringAsync("Please provide customer_email");
            return bad;
        }

        _logger.LogInformation($"Order status requested for {customerEmail}");

        // Query Dataverse for orders
        var orders = await _dataverse.GetOrdersByCustomerEmail(customerEmail);

        if (orders == null || orders.Entities == null || orders.Entities.Count == 0)
        {
            var notFound = req.CreateResponse(HttpStatusCode.OK);
            notFound.Headers.Add("Content-Type", "application/json; charset=utf-8");
            var msg = new { message = "No orders found for this customer" };
            await notFound.WriteStringAsync(JsonSerializer.Serialize(msg));
            return notFound;
        }

        var first = orders.Entities[0];

        // Map dataverse entity attributes to response object
        string orderName = first.Contains("crb_ordername") ? first["crb_ordername"]?.ToString() : null;
        string garmentType = first.Contains("crb_garmenttype") ? first["crb_garmenttype"]?.ToString() : null;

        object quantity = null;
        if (first.Contains("crb_quantity") && first["crb_quantity"] != null)
        {
            var q = first["crb_quantity"];
            if (q is int i) quantity = i;
            else if (q is long l) quantity = l;
            else if (q is decimal dm) quantity = dm;
            else quantity = q;
        }

        object totalAmount = null;
        if (first.Contains("crb_totalamount") && first["crb_totalamount"] != null)
        {
            var t = first["crb_totalamount"];
            if (t is Money m) totalAmount = m.Value;
            else if (t is decimal dm) totalAmount = dm;
            else totalAmount = t;
        }

        string status = null;
        if (first.Contains("crb_status") && first["crb_status"] != null)
        {
            var s = first["crb_status"];
            if (s is OptionSetValue osv) status = osv.Value.ToString();
            else status = s.ToString();
        }

        DateTime? dateUpdated = null;
        if (first.Contains("modifiedon") && first["modifiedon"] is DateTime dt)
        {
            dateUpdated = dt;
        }

        string notes = first.Contains("crb_notes") ? first["crb_notes"]?.ToString() : null;

        var resultObj = new
        {
            OrderName = orderName,
            GarmentType = garmentType,
            Quantity = quantity,
            TotalAmount = totalAmount,
            Status = status,
            DateUpdated = dateUpdated,
            Notes = notes
        };

        var ok = req.CreateResponse(HttpStatusCode.OK);
        ok.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await ok.WriteStringAsync(JsonSerializer.Serialize(resultObj));
        return ok;
    }
}
