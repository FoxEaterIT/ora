# Ora installer for Windows.
# Installs the application under %APPDATA%\Ora and prepares Node.js, npm, .env, and SQLite.
# An existing installation .env is left untouched.

param([switch]$InstalledCopy)

$ErrorActionPreference = "Stop"
$MinimumNodeMajor = 20

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  $versionText = & node -p "process.versions.node" 2>$null
  if (-not $versionText) { return $null }
  return [int]($versionText.Split(".")[0])
}

$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installRoot = Join-Path $env:APPDATA "Ora"

if ($InstalledCopy) {
  $root = $sourceRoot
} else {
  if ([System.IO.Path]::GetFullPath($sourceRoot).TrimEnd([char]92) -ine [System.IO.Path]::GetFullPath($installRoot).TrimEnd([char]92)) {
    Write-Step "Installing Ora to $installRoot"
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    $robocopy = Get-Command robocopy -ErrorAction SilentlyContinue
    if (-not $robocopy) { throw "robocopy is required to copy Ora to the installation folder." }
    & robocopy $sourceRoot $installRoot /E /XD node_modules .next .git /XF .env
    if ($LASTEXITCODE -ge 8) { throw "Could not copy Ora to $installRoot (robocopy exit code $LASTEXITCODE)." }
  }
  $root = $installRoot
}

Set-Location $root

Write-Host "Ora installer" -ForegroundColor Green
Write-Host "Project: $root"

Write-Step "Checking Node.js $MinimumNodeMajor or newer"
$nodeMajor = Get-NodeMajor
if ($null -eq $nodeMajor -or $nodeMajor -lt $MinimumNodeMajor) {
  Write-Host "Node.js was not found, or it is older than $MinimumNodeMajor."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Install Node.js $MinimumNodeMajor or newer from https://nodejs.org and run this installer again."
  }
  Write-Host "Installing Node.js LTS with winget. Windows may ask for confirmation."
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget could not install Node.js. Install it from https://nodejs.org and run this installer again."
  }
  Refresh-Path
  $nodeMajor = Get-NodeMajor
  if ($null -eq $nodeMajor -or $nodeMajor -lt $MinimumNodeMajor) {
    throw "Node.js was installed, but this window cannot see it yet. Close the window, open a new one, and run the installer again."
  }
}
Write-Host ("Node.js {0}" -f (& node -v))
Write-Host ("npm {0}" -f (& npm -v))

Write-Step "Installing project packages"
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Step "Preparing configuration"
$envFile = Join-Path $root ".env"
$exampleFile = Join-Path $root ".env.example"
if (Test-Path $envFile) {
  Write-Host ".env already exists. It was not changed."
} else {
  if (-not (Test-Path $exampleFile)) { throw ".env.example is missing." }
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $secret = [Convert]::ToBase64String($bytes)
  $content = [System.IO.File]::ReadAllText($exampleFile)
  $placeholder = 'AUTH_SECRET="replace-with-a-long-random-secret"'
  if (-not $content.Contains($placeholder)) {
    throw "Could not find the AUTH_SECRET placeholder in .env.example."
  }
  $content = $content.Replace($placeholder, "AUTH_SECRET=`"$secret`"")
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($envFile, $content, $utf8)
  Write-Host "Created .env with a random AUTH_SECRET."
  Write-Host "Owner email and password are empty: complete setup at /setup on first start."
}

Write-Step "Preparing persistent application data"
$envContent = [System.IO.File]::ReadAllText($envFile)
$databaseLine = [regex]::Match($envContent, '(?m)^DATABASE_URL="?([^"\r\n]+)"?\s*$')
if (-not $databaseLine.Success) { throw "DATABASE_URL is missing or invalid in .env." }
$databaseUrl = $databaseLine.Groups[1].Value
if ($databaseUrl -match '^file:(.+)$' -and $Matches[1] -notmatch '^(?:[A-Za-z]:[\\/]|\\\\|/)') {
  $dbDirectory = Join-Path $root "prisma"
  New-Item -ItemType Directory -Path $dbDirectory -Force | Out-Null
  Write-Host "Relative SQLite database path will be stored under $dbDirectory."
} elseif ($databaseUrl -match '^file:') {
  $dbPath = $databaseUrl.Substring(5)
  $dbDirectory = Split-Path -Parent $dbPath
  if ($dbDirectory) { New-Item -ItemType Directory -Path $dbDirectory -Force | Out-Null }
  Write-Host "Using configured SQLite path: $dbPath"
}

Write-Step "Creating the database schema"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed." }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed." }

$portMatch = [regex]::Match([System.IO.File]::ReadAllText($envFile), '(?m)^PORT="?(\d+)"?\s*$')
$port = if ($portMatch.Success) { $portMatch.Groups[1].Value } else { "33333" }

Write-Host ""
Write-Host "Ora is ready." -ForegroundColor Green
Write-Host "Install folder: $root"
Write-Host "Start it with:  npm run dev"
Write-Host "Then open:      http://localhost:$port"
Write-Host "First visit:    http://localhost:$port/setup"
