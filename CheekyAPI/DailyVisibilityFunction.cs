using System;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace CheekyAPI;

/// <summary>
/// Owner daily visibility endpoint - provides operational views for Larry.
/// GET /api/daily_visibility?view=due_today|due_tomorrow|overdue|missing_deposit|awaiting_approval|production_ready|printing|needs_qc
/// Returns structured JSON for each operational view.
/// </summary>
public class DailyVisibilityFunction
{
    private static readonly string[] ValidViews =
    {
        "due_today", "due_tomorrow", "overdue", "missing_deposit",
        "awaiting_approval", "production_ready", "printing", "needs_qc", "summary"
    };

    private readonly ILogger<DailyVisibilityFunction> _logger;

    public DailyVisibilityFunction(ILogger<DailyVisibilityFunction> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [Function("daily_visibility")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        _logger.LogInformation("Daily visibility request received.");

        string? view = null;
        var query = req.Url.Query;
        if (!string.IsNullOrEmpty(query))
        {
            var pairs = query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
            foreach (var kv in pairs)
            {
                var parts = kv.Split('=', 2);
                if (parts.Length == 2 && parts[0] == "view")
                {
                    view = Uri.UnescapeDataString(parts[1]).ToLowerInvariant();
                    break;
                }
            }
        }

        if (string.IsNullOrEmpty(view) || view == "summary")
        {
            return await WriteResponse(req, HttpStatusCode.OK, new
            {
                endpoint = "daily_visibility",
                description = "Cheeky OS Owner Daily Visibility",
                availableViews = ValidViews,
                usage = "GET /api/daily_visibility?view=due_today",
                dataverseQueries = new
                {
                    due_today = "Filter: crb_duedate = Today AND crb_orderstage <> Completed",
                    due_tomorrow = "Filter: crb_duedate = Tomorrow AND crb_orderstage <> Completed",
                    overdue = "Filter: crb_duedate < Today AND crb_orderstage <> Completed",
                    missing_deposit = "Filter: crb_depositpaid = false AND crb_orderstage in (Quote Sent, Deposit Paid)",
                    awaiting_approval = "Filter: crb_artworkstatus = Proof Sent AND crb_approvalstatus = Pending",
                    production_ready = "Filter: crb_orderstage = Production Ready",
                    printing = "Filter: crb_orderstage = Printing",
                    needs_qc = "Filter: crb_qcstatus = Pending AND crb_productionstatus = Completed"
                },
                cards = new object[]
                {
                    new { card = "Due Today",           filter = "due_today",           color = "#FF6B35", priority = 1 },
                    new { card = "Due Tomorrow",        filter = "due_tomorrow",        color = "#FFC107", priority = 2 },
                    new { card = "Missing Deposit",     filter = "missing_deposit",     color = "#DC3545", priority = 3 },
                    new { card = "Awaiting Approval",   filter = "awaiting_approval",   color = "#007BFF", priority = 4 },
                    new { card = "Production Ready",    filter = "production_ready",    color = "#17A2B8", priority = 5 },
                    new { card = "In Printing",         filter = "printing",            color = "#FF6B35", priority = 6 },
                    new { card = "Needs QC",            filter = "needs_qc",            color = "#FFC107", priority = 7 },
                    new { card = "Overdue",             filter = "overdue",             color = "#DC3545", priority = 8 }
                }
            });
        }

        // Return the Dataverse filter expression for the requested view
        var filterResult = GetViewFilter(view);

        return await WriteResponse(req, HttpStatusCode.OK, new
        {
            view,
            filter = filterResult.Filter,
            description = filterResult.Description,
            table = "crb_orders",
            columns = new[]
            {
                "crb_ordername", "crb_customername", "crb_customeremail", "crb_duedate",
                "crb_orderstage", "crb_paymentstatus", "crb_artworkstatus", "crb_totalamount",
                "crb_marginpercent", "crb_productiontype", "crb_quantity", "crb_rushflag"
            },
            sortBy = "crb_duedate asc"
        });
    }

    private static (string Filter, string Description) GetViewFilter(string view)
    {
        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");
        var tomorrow = DateTime.UtcNow.Date.AddDays(1).ToString("yyyy-MM-dd");

        return view switch
        {
            "due_today" => (
                $"crb_duedate ge {today}T00:00:00Z and crb_duedate lt {today}T23:59:59Z and crb_orderstage ne 100000005",
                "Orders due today that are not yet completed"
            ),
            "due_tomorrow" => (
                $"crb_duedate ge {tomorrow}T00:00:00Z and crb_duedate lt {tomorrow}T23:59:59Z and crb_orderstage ne 100000005",
                "Orders due tomorrow that are not yet completed"
            ),
            "overdue" => (
                $"crb_duedate lt {today}T00:00:00Z and crb_orderstage ne 100000005",
                "Orders past due date that are not completed"
            ),
            "missing_deposit" => (
                "crb_depositpaid eq false and (crb_orderstage eq 100000001 or crb_orderstage eq 100000002)",
                "Orders awaiting deposit payment"
            ),
            "awaiting_approval" => (
                "crb_artworkstatus eq 100000002 and crb_approvalstatus eq 100000000",
                "Orders with proof sent but not yet approved"
            ),
            "production_ready" => (
                "crb_orderstage eq 100000003",
                "Orders ready for production"
            ),
            "printing" => (
                "crb_orderstage eq 100000004",
                "Orders currently in printing"
            ),
            "needs_qc" => (
                "crb_qcstatus eq 100000000 and crb_productionstatus eq 100000002",
                "Orders where production is complete but QC is pending"
            ),
            _ => (
                "crb_orderstage ne 100000005",
                "All active orders"
            )
        };
    }

    private static async Task<HttpResponseData> WriteResponse(HttpRequestData req, HttpStatusCode status, object payload)
    {
        var resp = req.CreateResponse(status);
        resp.Headers.Add("Content-Type", "application/json; charset=utf-8");
        await resp.WriteStringAsync(JsonSerializer.Serialize(payload));
        return resp;
    }
}
