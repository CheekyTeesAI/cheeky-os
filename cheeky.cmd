@echo off
REM cheeky.cmd - CLI launcher for cheeky-orchestrator.ps1
REM
REM DevOps:
REM   cheeky deploy | doctor | fix | rebuild | logs | classify-error | autopilot
REM
REM Business:
REM   cheeky sync square          Pull Square data into Dataverse
REM   cheeky orders today         Show orders due today
REM   cheeky orders tomorrow      Show orders due tomorrow
REM   cheeky orders production    Show orders in production pipeline
REM   cheeky invoice create       Create a Square invoice
REM   cheeky invoice send         Send a Square invoice
REM   cheeky customer lookup      Look up a Square customer
REM   cheeky customer history     Show order history for a customer
REM   cheeky payments today       List payments received today
REM   cheeky copilot              Natural language command mode
REM
REM Production:
REM   cheeky production today     Print schedule for today
REM   cheeky production tomorrow  Print schedule for tomorrow
REM   cheeky production summary   Totals by print type and status
REM   cheeky task create          Generate tasks from ready orders
REM   cheeky task update          Change a task status
REM
REM Sales:
REM   cheeky quote create         Create a new quote
REM   cheeky unpaid               Show unpaid invoices
REM   cheeky reminder             Send payment reminder
REM   cheeky order-complete       Mark an order completed
REM   cheeky order-ready          Mark an order ready for pickup
REM
REM Email:
REM   cheeky email-scan           Scan inbox for order emails
REM
REM Dispatcher:
REM   cheeky ask "what jobs are due tomorrow"
REM   cheeky ask "show today's payments"
REM   cheeky ask "mark order 1024 complete"
REM
REM Cheeky OS:
REM   cheeky schema show          Show full data model
REM   cheeky schema validate      Check Dataverse tables exist
REM   cheeky schema provision     Create all 9 tables in Dataverse
REM   cheeky schema provision-dry Preview table creation (no changes)
REM   cheeky route                Production type routing check
REM   cheeky margin               Margin gate (45%) check
REM   cheeky validate             Full order validation (min + margin)
REM
SET scriptDir=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%scriptDir%cheeky-orchestrator.ps1" %*
