using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CheekyAPI;

public class DataverseService : IDisposable
{
    private readonly ServiceClient _serviceClient;
    private readonly ILogger<DataverseService> _logger;
    private bool _disposed;

    public DataverseService(IConfiguration configuration, ILogger<DataverseService> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        if (configuration == null) throw new ArgumentNullException(nameof(configuration));

        var connectionString = configuration["DataverseConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _logger.LogError("DataverseConnectionString is not configured in IConfiguration.");
            throw new InvalidOperationException("DataverseConnectionString configuration is required.");
        }

        try
        {
            _serviceClient = new ServiceClient(connectionString);
            _logger.LogInformation("Dataverse ServiceClient initialized using IConfiguration.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Dataverse ServiceClient.");
            throw;
        }
    }

    public async Task<EntityCollection> GetOrdersByCustomerEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            _logger.LogWarning("GetOrdersByCustomerEmail called with empty email.");
            return new EntityCollection();
        }

        var query = new QueryExpression("crb_orders")
        {
            ColumnSet = new ColumnSet(
                "crb_ordername",
                "crb_garmenttype",
                "crb_quantity",
                "crb_totalamount",
                "crb_status",
                "modifiedon",
                "crb_notes"),
            Criteria = new FilterExpression()
        };

        query.Criteria.AddCondition("crb_customeremail", ConditionOperator.Equal, email);

        try
        {
            // ServiceClient.RetrieveMultiple is synchronous; offload to thread pool to avoid blocking.
            var result = await Task.Run(() => _serviceClient.RetrieveMultiple(query));
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving orders for customer {Email}", email);
            throw;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _serviceClient?.Dispose();
        _disposed = true;
    }
}
