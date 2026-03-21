using System;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace CheekyAPI;

public class TestDataverseConnectionFunction
{
    private readonly ILogger<TestDataverseConnectionFunction> _logger;
    private readonly DataverseService _dataverse;

    public TestDataverseConnectionFunction(ILogger<TestDataverseConnectionFunction> logger, DataverseService dataverse)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _dataverse = dataverse ?? throw new ArgumentNullException(nameof(dataverse));
    }

    [Function("test_dataverse_connection")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/test_dataverse_connection")] HttpRequestData req)
    {
        _logger.LogInformation("Testing Dataverse connection...");

        try
        {
            var orders = await _dataverse.GetOrdersByCustomerEmail("test@test.com");
            var count = orders?.Entities?.Count ?? 0;

            var result = new
            {
                status = "Dataverse connection successful",
                recordsFound = count
            };

            var response = req.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", "application/json; charset=utf-8");
            await response.WriteStringAsync(JsonSerializer.Serialize(result));
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Dataverse connection test failed.");
            var response = req.CreateResponse(HttpStatusCode.InternalServerError);
            response.Headers.Add("Content-Type", "application/json; charset=utf-8");
            var err = new { error = ex.Message };
            await response.WriteStringAsync(JsonSerializer.Serialize(err));
            return response;
        }
    }
}
