# Aureum Blockchain Unified Setup & Installer (PowerShell)

Write-Host "🌟 Aureum Blockchain: Unified Setup & Installer" -ForegroundColor Cyan

# 1. Check Dependencies
Write-Host "`nStep 1: Checking Dependencies..." -ForegroundColor Blue

if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "✅ Rust is installed." -ForegroundColor Green
} else {
    Write-Host "❌ Rust not found. Please install from https://rustup.rs" -ForegroundColor Red
    exit
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "✅ Node.js $(node -v) is installed." -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found. Please install from https://nodejs.org" -ForegroundColor Red
    exit
}

# 2. Install Dependencies
Write-Host "`nStep 2: Installing Dependencies..." -ForegroundColor Blue
npm install
Set-Location aureum-wallet
npm install
Set-Location ..
Set-Location aureum-explorer
npm install
Set-Location ..

# 3. Build Aureum Node
Write-Host "`nStep 3: Building Aureum Node..." -ForegroundColor Blue
Set-Location aureum-node
cargo build --release
Set-Location ..

# 4. Initialize Node
Write-Host "`nStep 4: Initializing Chain Data..." -ForegroundColor Blue
if (-not (Test-Path "./data")) {
    .\aureum-node\target\release\aureum-node.exe init --data-dir ./data
} else {
    Write-Host "Data directory already exists. Skipping init."
}

# 5. Start Services
Write-Host "`nStep 5: Starting Ecosystem..." -ForegroundColor Blue

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Write-Host "✅ Starting via PM2..." -ForegroundColor Green
    pm2 delete all
    pm2 start deploy/ecosystem.config.js
} else {
    Write-Host "⚠️ PM2 not found. You should start services manually in separate terminals:" -ForegroundColor Yellow
    Write-Host "1. Node: .\aureum-node\target\release\aureum-node.exe run --rpc-port 8545 --data-dir ./data"
    Write-Host "2. Wallet: cd aureum-wallet; npm run dev"
    Write-Host "3. Explorer: cd aureum-explorer; npm run dev"
}

Write-Host "`n--------------------------------------------------" -ForegroundColor Blue
Write-Host "🔗 Wallet: http://localhost:3000" -ForegroundColor Green
Write-Host "🔗 Explorer: http://localhost:3001" -ForegroundColor Green
Write-Host "🔗 RPC Node: http://localhost:8545" -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Blue
