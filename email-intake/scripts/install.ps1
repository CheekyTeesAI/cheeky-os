# Cheeky Tees — Windows PowerShell Installation Script
# Checks prerequisites, installs dependencies, runs tests, and starts PM2.
#
# Usage: .\scripts\install.ps1
# Run from the email-intake directory.

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🚀 CHEEKY OS — Installation Script" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0

# ── Step 1: Check Node.js ──────────────────────────────────────────────────
Write-Host "  [1/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($major -ge 18) {
            Write-Host "  ✅ Node.js $nodeVersion (>= v18 required)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Node.js $nodeVersion is too old. v18+ required." -ForegroundColor Red
            Write-Host "     Download from: https://nodejs.org" -ForegroundColor Gray
            $ErrorCount++
        }
    } else {
        throw "not found"
    }
} catch {
    Write-Host "  ❌ Node.js not found. Install v18+ from https://nodejs.org" -ForegroundColor Red
    $ErrorCount++
}

if ($ErrorCount -gt 0) {
    Write-Host ""
    Write-Host "  ❌ Prerequisites not met. Fix the issues above and re-run." -ForegroundColor Red
    exit 1
}

# ── Step 2: npm install ────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [2/6] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ npm dependencies installed" -ForegroundColor Green

# ── Step 3: Check .env ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [3/6] Checking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "  ✅ .env file found" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  .env file NOT FOUND" -ForegroundColor Yellow
    Write-Host "     Copy .env.example to .env and fill in your values:" -ForegroundColor Gray
    Write-Host "     cp .env.example .env" -ForegroundColor Gray
    Write-Host "     The system will run with limited functionality without .env." -ForegroundColor Gray
}

# ── Step 4: Install PM2 globally ───────────────────────────────────────────
Write-Host ""
Write-Host "  [4/6] Checking PM2..." -ForegroundColor Yellow
try {
    $pm2Version = pm2 --version 2>$null
    if ($pm2Version) {
        Write-Host "  ✅ PM2 $pm2Version already installed" -ForegroundColor Green
    } else {
        throw "not found"
    }
} catch {
    Write-Host "  ⏳ Installing PM2 globally..." -ForegroundColor Yellow
    npm install -g pm2
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ PM2 installation failed. Try: npm install -g pm2" -ForegroundColor Red
        $ErrorCount++
    } else {
        Write-Host "  ✅ PM2 installed globally" -ForegroundColor Green
    }
}

# ── Step 5: Run tests ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [5/6] Running test suite..." -ForegroundColor Yellow
node tests/test-runner.js --all
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Tests failed. Fix failing tests before deployment." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ All tests passed" -ForegroundColor Green

# ── Step 6: Start PM2 ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [6/6] Starting Cheeky OS via PM2..." -ForegroundColor Yellow
pm2 start ecosystem.config.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ PM2 start failed." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Cheeky OS started via PM2" -ForegroundColor Green

# ── Summary ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ CHEEKY OS — INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Cyan
Write-Host "    pm2 status                — check process status" -ForegroundColor Gray
Write-Host "    pm2 logs cheeky-os        — view application logs" -ForegroundColor Gray
Write-Host "    pm2 logs cheeky-health    — view health monitor logs" -ForegroundColor Gray
Write-Host "    pm2 restart cheeky-os     — restart the application" -ForegroundColor Gray
Write-Host "    pm2 stop all              — stop everything" -ForegroundColor Gray
Write-Host "    pm2 delete all            — remove all processes" -ForegroundColor Gray
Write-Host ""
Write-Host "  Manual run (without PM2):" -ForegroundColor Cyan
Write-Host "    node start.js             — start webhook + email poller" -ForegroundColor Gray
Write-Host "    node intake.js            — manual order intake" -ForegroundColor Gray
Write-Host ""
