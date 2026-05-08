# Estimate conversion flow — OpenAI (primary)

Replace or parallel **Claude** branches in `SquareEstimateConversionFlow` / email estimate flows with the **OpenAI Chat Completions** custom connector.

## Connector

- File: `../connectors/openai-chat-completions-v1.openapi.yaml`
- In Power Platform: **Custom connectors** → New → OpenAPI 3.0 → upload YAML.
- **Security:** HTTP Bearer — paste API key in connection (store in environment / Key Vault for prod).
- **Test:** `CreateChatCompletion` with `model: gpt-4o`, `response_format: { "type": "json_object" }`, messages from next section.

## Flow shape (recommended)

1. **Trigger:** When `ct_intake_queue` row is modified and `ct_status` becomes **QUOTE_PENDING** (or “Next stage” button sets QUOTE_PENDING).
2. **Get row:** Current intake (customer text from `ct_raw_payload` or related note / email body).
3. **Compose — system prompt:** Paste or load from `prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md` (truncate if connector limits; prefer **Dataverse “Prompt template”** table or **Environment variable** for length).
4. **OpenAI — CreateChatCompletion:**
   - `model`: `gpt-4o` or `gpt-4-turbo` (per your org).
   - `messages[0].role`: `system`, `content`: full Cheeky prompt.
   - `messages[1].role`: `user`, `content`: JSON string `{ "context": {…}, "customerMessageOrFormText": "…" }`.
   - `response_format`: `{ "type": "json_object" }`.
   - `temperature`: `0.2`.
5. **Parse JSON:** `Parse JSON` action on `choices[0].message.content` (or expression).
6. **Patch `ct_intake_queue`:**  
   - `ct_parsed_json` = stringified quote  
   - Optionally derive display fields for tiles.
7. **Branch:** If `clarifyingQuestions` non-empty → notify ops; do **not** send Square invoice until cleared.
8. **Next flow / child:** Create Square draft invoice, **PATCH** same intake row with **`ct_square_invoice_id`**, set `ct_status` to **INVOICE_SENT**.

## Optional: Node instead of connector

`POST https://<host>/api/cheeky-intake/quote-parse` with header `x-cheeky-intake-key: <CHEEKY_INTAKE_QUOTE_API_KEY>` and body:

```json
{
  "ct_status": "QUOTE_PENDING",
  "rawCustomerText": "...",
  "ct_intake_queueid": "...",
  "customerEmail": "...",
  "customerName": "...",
  "channel": "EMAIL"
}
```

Response includes `ct_parsed_json` and `quote` object (`version: cheeky_quote_v1`).

## crb_ → ct_

Point all actions at **`ct_intake_queues`** / **`ct_*`** columns. Retire `crb_*` in this flow after migration (`02-SCHEMA-CT-MIGRATION.md`).
