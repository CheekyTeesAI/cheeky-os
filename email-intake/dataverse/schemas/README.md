# Dataverse Schema Definitions — Cheeky Tees

> **Version:** 1.0 (Phase 9)
> **Environment:** Microsoft Dataverse (Power Platform)
> **Publisher Prefix:** `ct_`

---

## Overview

These schema files define the planned Dataverse tables for the Cheeky Tees system. Each `.schema.json` file provides the complete field list, data types, constraints, and relationships needed to create the table in Dataverse.

### Existing Tables (already in Dataverse)

| Table | Set Name | Purpose |
|-------|----------|---------|
| `ct_orders` | `ct_orderses` | Customer orders — created by the intake pipeline |
| `ct_laborrecords` | `ct_laborrecordses` | Labor tracking linked to orders |

### New Tables (defined in this folder)

| Schema File | Table | Purpose |
|------------|-------|---------|
| `ct_customers.schema.json` | `ct_customers` | Customer contact info, address, order history |
| `ct_vendors.schema.json` | `ct_vendors` | Supplier/vendor contacts and terms |
| `ct_quotes.schema.json` | `ct_quotes` | Pricing estimates before order confirmation |
| `ct_production.schema.json` | `ct_production` | Production pipeline tracking per order |

---

## Entity Relationship Diagram

```
┌──────────────────┐
│   ct_customers   │
│──────────────────│
│ ct_customersid   │◄─────────────────────────────────────┐
│ ct_name          │                                      │
│ ct_email         │                                      │
│ ct_phone         │                                      │
│ ct_address       │                                      │
│ ct_city          │                                      │
│ ct_state         │                                      │
│ ct_zip           │                                      │
│ ct_totalorders   │                                      │
│ ct_notes         │                                      │
└──────────────────┘                                      │
        │                                                 │
        │ 1:N (one customer → many orders)                │
        ▼                                                 │
┌──────────────────┐                                      │
│   ct_orderses    │       ┌───────────────────┐          │
│──────────────────│       │  ct_laborrecords  │          │
│ ct_ordersesid    │◄──────│  ct_orderid       │          │
│ ct_customername  │       │  ct_assignedto    │          │
│ ct_customeremail │       │  ct_hours         │          │
│ ct_garmenttype   │       └───────────────────┘          │
│ ct_quantity      │                                      │
│ ct_productiontype│       ┌───────────────────┐          │
│ ct_duedate       │       │  ct_production    │          │
│ ct_notes         │◄──────│  ct_orderid       │          │
│ ...              │       │  ct_stage         │          │
└──────────────────┘       │  ct_assignedto    │          │
                           │  ct_printtype     │          │
                           │  ct_artstatus     │          │
                           │  ct_garmentstatus │          │
                           └───────────────────┘          │
                                                          │
┌──────────────────┐                                      │
│    ct_quotes     │                                      │
│──────────────────│                                      │
│ ct_quotesid      │                                      │
│ ct_quoteid       │                                      │
│ ct_customerid    │──────────────────────────────────────┘
│ ct_product       │     N:1 (many quotes → one customer)
│ ct_quantity      │
│ ct_unitprice     │
│ ct_totalprice    │
│ ct_status        │
└──────────────────┘

┌──────────────────┐
│   ct_vendors     │   (standalone — no FK relationships)
│──────────────────│
│ ct_vendorsid     │
│ ct_name          │
│ ct_contactname   │
│ ct_producttype   │
│ ct_leadtimedays  │
│ ct_paymentterms  │
└──────────────────┘
```

---

## Table Details

### ct_customers

**Purpose:** Central customer registry. Stores contact info, shipping address, and a running order count. Every order and quote links back to a customer.

**Key Fields:**
- `ct_name` (required) — Customer or organization name
- `ct_email` — Used for order confirmation emails and lookup matching
- `ct_totalorders` — Incremented by the pipeline or a Dataverse rollup rule

**Relationship:** One customer → many orders (via `ct_customerid` lookup on `ct_orderses`)

---

### ct_vendors

**Purpose:** Tracks blank garment suppliers (S&S Activewear, SanMar, etc.), ink vendors, and other supply chain contacts. Standalone table with no foreign keys.

**Key Fields:**
- `ct_name` (required) — Vendor company name
- `ct_producttype` — What they supply (blank tees, ink, transfer paper, etc.)
- `ct_leadtimedays` — Typical delivery lead time in business days
- `ct_paymentterms` — Payment arrangement (Net 30, COD, Prepaid, etc.)

**Relationship:** None — standalone reference table

---

### ct_quotes

**Purpose:** Tracks pricing estimates before a customer confirms an order. Quotes can be converted to orders once accepted.

**Key Fields:**
- `ct_quoteid` (required) — Human-readable identifier (e.g. QT-2025-0042)
- `ct_customerid` (required, lookup) — Links to `ct_customers`
- `ct_unitprice` / `ct_totalprice` — Pricing with 2-decimal precision
- `ct_status` — Lifecycle: draft → sent → accepted/rejected/expired
- `ct_validuntil` — Expiration date (typically 30 days)

**Relationship:** Many quotes → one customer (via `ct_customerid` lookup)

---

### ct_production

**Purpose:** Tracks each order through the production pipeline from intake to shipping. One production record per order.

**Key Fields:**
- `ct_orderid` (required, lookup) — Links to `ct_orderses`
- `ct_stage` (required) — Current stage: `received` → `art` → `printing` → `finished` → `shipped`
- `ct_assignedto` — Who is handling this production run (Chad, Pat, etc.)
- `ct_artstatus` — Art/proof status: pending, proofed, approved, revision needed
- `ct_garmentstatus` — Blank garment status: ordered, received, in stock

**Relationship:** Many production records → one order (via `ct_orderid` lookup)

**Stage Flow:**
```
received → art → printing → finished → shipped
   │         │       │          │          │
   │         │       │          │          └─ Ship date recorded
   │         │       │          └─ Ready to ship
   │         │       └─ On press / in production
   │         └─ Art proofing / customer approval
   └─ Order received, queued
```

---

## How to Create Tables in Dataverse

1. Open [Power Apps Maker Portal](https://make.powerapps.com)
2. Navigate to **Tables** → **New table**
3. Set the table name and publisher prefix (`ct_`)
4. Add columns matching the schema file fields
5. For `lookup` type fields, create a **Lookup** column pointing to the related table
6. Save and publish

Alternatively, use the Dataverse Web API:
```
POST {DATAVERSE_URL}/api/data/v9.2/EntityDefinitions
```

Or use the column-check tool to validate existing tables:
```bash
node dataverse/column-check.js
```

---

## Pipeline Integration Points

| Table | Created By | Updated By |
|-------|-----------|------------|
| `ct_orderses` | `intake.js` (POST to Dataverse) | Power Automate, manual |
| `ct_laborrecords` | `intake.js` (createLaborRecord) | Manual |
| `ct_customers` | Future: intake pipeline auto-creates on new email | Power Automate, manual |
| `ct_vendors` | Manual entry | Manual |
| `ct_quotes` | Future: quote calculator (Phase 10+) | Power Automate, manual |
| `ct_production` | Future: auto-created on new order | `POST /production-update`, Power Automate |
