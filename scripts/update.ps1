# External Windows updater. Downloads/stages first, then stops and restarts OraTimeTrackingService.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$InstallPath)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$serviceName = "OraTimeTrackingService"
$install = [System.IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92)

function Assert-CommandSucceeded([string]$Name) {
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path (Join-Path $install "package.json"))) { throw "InstallPath is not an Ora installation: $install" }
if (-not (Test-Path (Join-Path $install ".env"))) { throw "No .env found. Refusing to update." }
$service = Get-Service -Name $serviceName -ErrorAction Stop
if ($service.Status -ne "Running") { throw "$serviceName is not running. Start the Ora service before requesting an update." }
$wasRunning = $true
$current = Get-Content (Join-Path $install "package.json") -Raw | ConvertFrom-Json
$currentVersion = [string]$current.version

Write-Host "Checking latest stable Ora release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/FoxEaterIT/ora/releases/latest" -Headers @{ "User-Agent" = "Ora-External-Updater"; Accept = "application/vnd.github+json" } -TimeoutSec 20
if ($release.draft -or $release.prerelease) { throw "Latest GitHub release is not stable." }
$targetVersion = ([string]$release.tag_name) -replace "^v", ""
if ($targetVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid stable release tag: $($release.tag_name)" }
if ([version]$targetVersion -le [version]$currentVersion) { Write-Host "Already up to date ($currentVersion)."; exit 0 }
$asset = @($release.assets | Where-Object { $_.name -eq "ora-v$targetVersion.zip" }) | Select-Object -First 1
if (-not $asset -or $asset.digest -notmatch '^sha256:(.+)$') { throw "Release archive or SHA-256 digest is missing." }
$expectedHash = $Matches[1].ToLowerInvariant()

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("ora-update-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $work $asset.name
$stage = Join-Path $work "stage"
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive -TimeoutSec 180
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw "Release archive checksum verification failed." }
Expand-Archive -LiteralPath $archive -DestinationPath $stage
$packageFile = Get-ChildItem -LiteralPath $stage -Filter package.json -File -Recurse | Select-Object -First 1
if (-not $packageFile) { throw "Release archive does not contain package.json." }
$releaseRoot = $packageFile.Directory.FullName
$newPackage = Get-Content $packageFile.FullName -Raw | ConvertFrom-Json
if ([string]$newPackage.version -ne $targetVersion) { throw "Archive package version does not match release tag." }

Write-Host "Preparing release $targetVersion. Ora remains online while dependencies are installed."
Copy-Item (Join-Path $install ".env") (Join-Path $releaseRoot ".env") -Force
$serviceConfig = Join-Path $install "$serviceName.xml"
if (Test-Path $serviceConfig) { Copy-Item $serviceConfig (Join-Path $releaseRoot "$serviceName.xml") -Force }
$serviceExe = Join-Path $install "$serviceName.exe"
if (Test-Path $serviceExe) { Copy-Item $serviceExe (Join-Path $releaseRoot "$serviceName.exe") -Force }
$custom = Join-Path $install "public\custom"
if (Test-Path $custom) { New-Item -ItemType Directory -Path (Join-Path $releaseRoot "public") -Force | Out-Null; Copy-Item $custom (Join-Path $releaseRoot "public\custom") -Recurse -Force }
Push-Location $releaseRoot
try {
  npm ci
  Assert-CommandSucceeded "npm ci"
  npx prisma generate
  Assert-CommandSucceeded "prisma generate"
  npm run build
  Assert-CommandSucceeded "npm run build"
} finally { Pop-Location }

# Database copy must happen only after the service is stopped, so SQLite writes are quiesced.
$activationStarted = $false
$backupRoot = "$install.update-backup-$currentVersion"
$dbDir = Join-Path $install "prisma"
$activeDb = Join-Path $dbDir "ORA.db"
$backupDb = Join-Path $dbDir "ORA_Backup.db"
$stagedDb = Join-Path $releaseRoot "prisma\ORA.db"
try {
  if ($wasRunning) {
    Write-Host "Stopping $serviceName for database migration..."
    Stop-Service -Name $serviceName -Force
    (Get-Service -Name $serviceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(90))
  }
  $stillRunning = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$install*" }
  if ($stillRunning) { throw "Ora node process is still running (PID $($stillRunning.ProcessId)); refusing to access SQLite." }
  if (-not (Test-Path $activeDb)) { throw "ORA.db is missing: $activeDb" }
  foreach ($suffix in @("-wal", "-shm")) {
    if (Test-Path "$activeDb$suffix") { throw "SQLite sidecar exists: $activeDb$suffix. Database was not copied; investigate before retrying." }
  }
  if (Test-Path $backupRoot) { throw "Application backup already exists: $backupRoot. Preserve it before retrying." }

  New-Item -ItemType Directory -Path (Split-Path $stagedDb -Parent) -Force | Out-Null
  Copy-Item $activeDb $stagedDb -Force
  Push-Location $releaseRoot
  try {
    npx prisma migrate deploy
    Assert-CommandSucceeded "prisma migrate deploy"
  } finally { Pop-Location }

  # Keep an immutable, per-release copy alongside the fixed one-generation backup.
  Copy-Item $activeDb $backupDb -Force
  New-Item -ItemType Directory -Path $backupRoot | Out-Null
  Copy-Item $activeDb (Join-Path $backupRoot "ORA.db")
  Copy-Item (Join-Path $install ".env") (Join-Path $backupRoot ".env")
  if (Test-Path $custom) { New-Item -ItemType Directory -Path (Join-Path $backupRoot "public") -Force | Out-Null; Copy-Item $custom (Join-Path $backupRoot "public\custom") -Recurse -Force }

  # Save old application files before changing the installation directory.
  Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @(".env", "prisma") } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $backupRoot -Recurse -Force
  }
  $activationStarted = $true
  Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @(".env", "prisma") } | Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $releaseRoot -Force | Where-Object { $_.Name -notin @(".env", "prisma") } | ForEach-Object {
    Move-Item -LiteralPath $_.FullName -Destination $install
  }
  Copy-Item $stagedDb $activeDb -Force
  Write-Host "Ora $targetVersion installed. Pre-update database retained as prisma\ORA_Backup.db."
} catch {
  if ($activationStarted -and (Test-Path $backupRoot)) {
    Write-Warning "Activation failed. Restoring application files and pre-update database."
    Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @(".env", "prisma") } | Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $backupRoot -Force | Where-Object { $_.Name -notin @("ORA.db", ".env", "public") } | ForEach-Object { Copy-Item $_.FullName -Destination $install -Recurse -Force }
    $backupPublic = Join-Path $backupRoot "public\custom"
    if (Test-Path $backupPublic) { New-Item -ItemType Directory -Path (Join-Path $install "public") -Force | Out-Null; Copy-Item $backupPublic (Join-Path $install "public\custom") -Recurse -Force }
    Copy-Item (Join-Path $backupRoot "ORA.db") $activeDb -Force
  }
  throw
} finally {
  if ((Get-Service -Name $serviceName).Status -ne "Running") {
    Write-Host "Starting $serviceName..."
    Start-Service -Name $serviceName
    (Get-Service -Name $serviceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(90))
  }
}
Write-Host "Update complete. Confirm the service and IIS site are healthy before removing any backups."
