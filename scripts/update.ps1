# External Windows updater. Downloads/stages first, then stops and restarts OraTimeTrackingService.
[CmdletBinding()]
param([string]$InstallPath, [string]$StatusPath = (Join-Path $env:ProgramData "Ora\updater-status.json"))

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$serviceName = "OraTimeTrackingService"
$updaterServiceName = "OraTrackingServiceUpdater"

function Assert-CommandSucceeded([string]$Name) {
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}
function Set-UpdatePhase([string]$Phase, [string]$Message, [string]$Version = "") {
  $status = [ordered]@{ phase = $Phase; message = $Message; targetVersion = $Version; updatedAt = [DateTime]::UtcNow.ToString("o") }
  $temporary = "$StatusPath.tmp"
  [IO.File]::WriteAllText($temporary, ($status | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
}

# Auto-detect installation path if not provided
if (-not $InstallPath) {
    $install = Join-Path $env:APPDATA "Ora"
    if (-not (Test-Path (Join-Path $install "package.json"))) {
        # Check if OraTimeTrackingService is running and get its working directory
        $service = Get-Service -Name "OraTimeTrackingService" -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Running") {
            $install = (Get-Item (Get-WmiObject Win32_Service -Filter "Name='$service.Name'").PathName).DirectoryName
            if (-not (Test-Path (Join-Path $install "package.json"))) {
                throw "Cannot determine Ora installation path. Please specify -InstallPath or ensure Ora is installed at %APPDATA%\Ora"
            }
        } else {
            throw "InstallPath is not an Ora installation: $install"
        }
    }
} else {
    $install = [System.IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92)
}

if (-not (Test-Path (Join-Path $install "package.json"))) { throw "InstallPath is not an Ora installation: $install" }
if (-not (Test-Path (Join-Path $install ".env"))) { throw "No .env found. Refusing to update." }
$service = Get-Service -Name $serviceName -ErrorAction Stop
if ($service.Status -ne "Running") { throw "$serviceName is not running. Start the Ora service before requesting an update." }
$wasRunning = $true
$current = Get-Content (Join-Path $install "package.json") -Raw | ConvertFrom-Json
$currentVersion = [string]$current.version

Set-UpdatePhase "downloading" "Checking the latest stable Ora release..."
Write-Host "Checking latest stable Ora release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/FoxEaterIT/ora/releases/latest" -Headers @{ "User-Agent" = "Ora-External-Updater"; Accept = "application/vnd.github+json" } -TimeoutSec 20
if ($release.draft -or $release.prerelease) { throw "Latest GitHub release is not stable." }
$targetVersion = ([string]$release.tag_name) -replace "^v", ""
if ($targetVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid stable release tag: $($release.tag_name)" }
if ([version]$targetVersion -le [version]$currentVersion) { Set-UpdatePhase "succeeded" "Ora is already up to date." $currentVersion; Write-Host "Already up to date ($currentVersion)."; exit 0 }
Set-UpdatePhase "downloading" "Downloading the verified release archive." $targetVersion
$asset = @($release.assets | Where-Object { $_.name -eq "ora-v$targetVersion.zip" }) | Select-Object -First 1
if (-not $asset -or $asset.digest -notmatch '^sha256:(.+)$') { throw "Release archive or SHA-256 digest is missing." }
$expectedHash = $Matches[1].ToLowerInvariant()

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("ora-update-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $work $asset.name
$stage = Join-Path $work "stage"
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive -TimeoutSec 180
Set-UpdatePhase "verifying" "Verifying the release archive checksum." $targetVersion
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw "Release archive checksum verification failed." }
Expand-Archive -LiteralPath $archive -DestinationPath $stage
$packageFile = Get-ChildItem -LiteralPath $stage -Filter package.json -File -Recurse | Select-Object -First 1
if (-not $packageFile) { throw "Release archive does not contain package.json." }
$releaseRoot = $packageFile.Directory.FullName
$newPackage = Get-Content $packageFile.FullName -Raw | ConvertFrom-Json
if ([string]$newPackage.version -ne $targetVersion) { throw "Archive package version does not match release tag." }

Set-UpdatePhase "building" "Preparing the release while Ora remains online." $targetVersion
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
    Set-UpdatePhase "stopping" "Ora will be briefly unavailable while the update is applied." $targetVersion
    Write-Host "Stopping $serviceName for database migration..."
    Stop-Service -Name $serviceName -Force
    (Get-Service -Name $serviceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(90))
  }
  $updaterServiceName = "OraTrackingServiceUpdater"
  $stillRunning = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$install*" }
  if ($stillRunning) { throw "Ora node process is still running (PID $($stillRunning.ProcessId)); refusing to access SQLite." }
  if (-not (Test-Path $activeDb)) { throw "ORA.db is missing: $activeDb" }
  foreach ($suffix in @("-wal", "-shm")) {
    if (Test-Path "$activeDb$suffix") { throw "SQLite sidecar exists: $activeDb$suffix. Database was not copied; investigate before retrying." }
  }
  if (Test-Path $backupRoot) { throw "Application backup already exists: $backupRoot. Preserve it before retrying." }

  New-Item -ItemType Directory -Path (Split-Path $stagedDb -Parent) -Force | Out-Null
  Set-UpdatePhase "migrating" "Migrating a staged database copy." $targetVersion
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
  Set-UpdatePhase "activating" "Activating the updated application files." $targetVersion
  $activationStarted = $true
  Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @(".env", "prisma", "$updaterServiceName.exe", "$updaterServiceName.xml") } | Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $releaseRoot -Force | Where-Object { $_.Name -notin @(".env", "prisma") } | ForEach-Object {
    Move-Item -LiteralPath $_.FullName -Destination $install
  }
  Copy-Item $stagedDb $activeDb -Force
  Write-Host "Ora $targetVersion installed. Pre-update database retained as prisma\ORA_Backup.db."
} catch {
  if ($activationStarted -and (Test-Path $backupRoot)) {
    Write-Warning "Activation failed. Restoring application files and pre-update database."
    Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @(".env", "prisma", "$updaterServiceName.exe", "$updaterServiceName.xml") } | Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $backupRoot -Force | Where-Object { $_.Name -notin @("ORA.db", ".env", "public") } | ForEach-Object { Copy-Item $_.FullName -Destination $install -Recurse -Force }
    $backupPublic = Join-Path $backupRoot "public\custom"
    if (Test-Path $backupPublic) { New-Item -ItemType Directory -Path (Join-Path $install "public") -Force | Out-Null; Copy-Item $backupPublic (Join-Path $install "public\custom") -Recurse -Force }
    Copy-Item (Join-Path $backupRoot "ORA.db") $activeDb -Force
  }
  throw
} finally {
  if ((Get-Service -Name $serviceName).Status -ne "Running") {
    Set-UpdatePhase "restarting" "Restarting Ora after the update." $targetVersion
    Write-Host "Starting $serviceName..."
    Start-Service -Name $serviceName
    (Get-Service -Name $serviceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(90))
  }
}

# Provision the auxiliary updater only after the main application has restarted successfully.
# Its WinSW executable and service registration live in the install directory, so stop it before replacing them.
$updaterExe = Join-Path $install "$updaterServiceName.exe"
$updaterXml = Join-Path $install "$updaterServiceName.xml"
$updaterAgent = Join-Path $install "scripts\updater-agent.ps1"
$updaterClient = Join-Path $install "scripts\updater-client.ps1"
$updaterStatus = Join-Path $env:ProgramData "Ora\updater-status.json"
$updaterLog = Join-Path $install "logs\updater"
$updaterService = Get-Service -Name $updaterServiceName -ErrorAction SilentlyContinue

try {
  $releaseAgent = Join-Path $releaseRoot "scripts\updater-agent.ps1"
  $releaseClient = Join-Path $releaseRoot "scripts\updater-client.ps1"
  if (-not (Test-Path -LiteralPath $releaseAgent) -or -not (Test-Path -LiteralPath $releaseClient)) {
    throw "Verified release is missing updater service scripts. Ora was updated, but $updaterServiceName was not installed or changed."
  }

  # WinSW embeds the service XML next to its wrapper; stop/uninstall before files are replaced.
  if ($updaterService) {
    if ($updaterService.Status -ne "Stopped") {
      Set-UpdatePhase "restarting" "Ora is back online; refreshing the updater service." $targetVersion
      Stop-Service -Name $updaterServiceName -Force
      (Get-Service -Name $updaterServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
    }
    $previousUpdaterExe = Join-Path $backupRoot "$updaterServiceName.exe"
    if (-not (Test-Path -LiteralPath $previousUpdaterExe)) {
      throw "Previous $updaterServiceName wrapper was not retained in the application backup."
    }
    & $previousUpdaterExe uninstall
    Assert-CommandSucceeded "$updaterServiceName uninstall"
  }
  $releaseWinSw = Join-Path $releaseRoot "$updaterServiceName.exe"
  if (Test-Path -LiteralPath $releaseWinSw) {
    Copy-Item -LiteralPath $releaseWinSw -Destination $updaterExe -Force
  } elseif (-not (Test-Path -LiteralPath $updaterExe)) {
    # Older archives omit generated WinSW binaries. Reuse Ora's existing trusted wrapper.
    if (-not (Test-Path -LiteralPath $serviceExe)) {
      throw "The existing Ora WinSW wrapper is missing; cannot provision $updaterServiceName safely."
    }
    Copy-Item -LiteralPath $serviceExe -Destination $updaterExe -Force
  }

  Copy-Item -LiteralPath $releaseAgent -Destination $updaterAgent -Force
  Copy-Item -LiteralPath $releaseClient -Destination $updaterClient -Force
  New-Item -ItemType Directory -Path (Split-Path -Parent $updaterStatus) -Force | Out-Null
  New-Item -ItemType Directory -Path $updaterLog -Force | Out-Null
  $escapedInstall = [System.Security.SecurityElement]::Escape($install)
  $escapedStatus = [System.Security.SecurityElement]::Escape($updaterStatus)
  $xml = @"
<service>
  <id>$updaterServiceName</id>
  <name>Ora Tracking Service Updater</name>
  <description>Privileged local updater broker for Ora Time Tracking</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;$escapedInstall\scripts\updater-agent.ps1&quot; -InstallPath &quot;$escapedInstall&quot; -StatusPath &quot;$escapedStatus&quot;</arguments>
  <workingdirectory>$escapedInstall</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>$updaterLog</logpath>
</service>
"@
  [System.IO.File]::WriteAllText($updaterXml, $xml, [System.Text.UTF8Encoding]::new($false))

  & $updaterExe install
  Assert-CommandSucceeded "$updaterServiceName install"
  if (-not (Get-Service -Name $updaterServiceName -ErrorAction SilentlyContinue)) {
    throw "WinSW reported successful installation, but $updaterServiceName is not registered."
  }
  Start-Service -Name $updaterServiceName
  (Get-Service -Name $updaterServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(60))
} catch {
  $updaterError = $_.Exception.Message
  Set-UpdatePhase "failed" "Ora was updated, but the updater service could not be installed or started. Run install.cmd as Administrator to repair it." $targetVersion
  throw "Ora $targetVersion is running, but $updaterServiceName provisioning failed: $updaterError"
}

Set-UpdatePhase "succeeded" "Ora is running the updated version and the updater service is ready." $targetVersion
Write-Host "Update complete. Confirm the service and IIS site are healthy before removing any backups."
