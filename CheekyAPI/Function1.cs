using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace CheekyAPI;

public class SendInvoiceFunction
{
    private readonly ILogger<SendInvoiceFunction> _logger;

    public SendInvoiceFunction(ILogger<SendInvoiceFunction> logger)
    {
        _logger = logger;
    }

    [Function("send_invoice")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req)
    {
        _logger.LogInformation("Send invoice request received.");

        return new OkObjectResult("Cheeky invoice endpoint active.");
    }
}
