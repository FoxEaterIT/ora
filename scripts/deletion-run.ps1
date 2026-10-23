# Fixed worker launched by the elevated deletion broker after an authenticated Owner request.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallPath,
  [Parameter(Mandatory = $true)][string]$StatusPath,
  [Parameter(Mandatory = $true)][string]$ExportRoot,
  [Parameter(Mandatory = $true)][ValidateSet("true", "false")][string]$KeepData,
  [Parameter(Mandatory = $true)][ValidateSet("true", "false")][string]$CreateExcel
)
$ErrorActionPreference = "Stop"
$install = [IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92)
$profileRoot = Split-Path (Split-Path (Split-Path $install -Parent) -Parent) -Parent
$expectedExportRoot = [IO.Path]::GetFullPath((Join-Path $profileRoot "Documents\Ora-Uninstall-Exports")).TrimEnd([char]92)
$expectedStatusPath = [IO.Path]::GetFullPath((Join-Path $env:ProgramData "Ora\deletion-status.json"))
if ([IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92) -ine [IO.Path]::GetFullPath((Join-Path $env:APPDATA "Ora")).TrimEnd([char]92)) { throw "Worker install path is not the fixed Ora application path." }
if ([IO.Path]::GetFullPath($StatusPath) -ine $expectedStatusPath) { throw "Deletion status path is not the pinned Ora status file." }
if ([IO.Path]::GetFullPath($ExportRoot).TrimEnd([char]92) -ine $expectedExportRoot) { throw "Export destination is not the fixed Ora uninstall export folder." }
$serviceName = "OraTimeTrackingDeletion"
function Write-Status([string]$Phase, [string]$Message) {
  $value = [ordered]@{ phase = $Phase; message = $Message; updatedAt = [DateTime]::UtcNow.ToString("o") }
  $tmp = "$StatusPath.tmp"
  [IO.File]::WriteAllText($tmp, ($value | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $StatusPath -Force
}
function Remove-Service([string]$Name, [string]$Exe) {
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service) { return }
  if ($service.Status -ne "Stopped") { Stop-Service -Name $Name -Force; (Get-Service -Name $Name).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60)) }
  if (-not (Test-Path -LiteralPath $Exe)) { throw "Service wrapper is missing for $Name. Application files were not deleted." }
  & $Exe uninstall
  if ($LASTEXITCODE -ne 0) { throw "Could not remove service $Name. Application files were not deleted." }
}
try {
  Write-Status "preparing" "Checking Ora processes and database safety."
  $dbPath = Join-Path $install "prisma\ORA.db"
  if (-not (Test-Path -LiteralPath (Join-Path $install "package.json")) -or -not (Test-Path -LiteralPath $dbPath)) { throw "Pinned Ora installation or database is missing; refusing to uninstall." }
  foreach ($suffix in @("-wal", "-shm")) { if (Test-Path -LiteralPath "$dbPath$suffix") { throw "SQLite sidecar exists; refusing to uninstall." } }
  foreach ($name in @("OraTrackingServiceUpdater", "OraTimeTrackingUpdater", "OraTimeTrackingService")) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    $wrapper = Join-Path $install "$name.exe"
    if ($service -and -not (Test-Path -LiteralPath $wrapper)) { throw "Service wrapper is missing for $name; no data or services were modified." }
  }
  $profileRoot = Split-Path (Split-Path (Split-Path $install -Parent) -Parent) -Parent
  $documentsRoot = Join-Path $profileRoot "Documents"
  $dataRoot = $null
  if ($KeepData -eq "true") {
    $dataRoot = Join-Path $documentsRoot ("Ora-Uninstall-Data-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    foreach ($relative in @(".env", "prisma\ORA.db", "prisma\ORA_Backup.db", "public\custom")) {
      $source = Join-Path $install $relative
      if (Test-Path -LiteralPath $source) { $destination = Join-Path $dataRoot $relative; New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null; Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot ".env"))) { throw "Preserved .env is missing; original application files were not deleted." }
    $copyDb = Join-Path $dataRoot "prisma\ORA.db"
    if (-not (Test-Path -LiteralPath $copyDb) -or (Get-FileHash $dbPath -Algorithm SHA256).Hash -ne (Get-FileHash $copyDb -Algorithm SHA256).Hash) { throw "Preserved database verification failed; original files were not deleted." }
  }
  $exportRoot = $null
  if ($CreateExcel -eq "true") {
    $exportRoot = Join-Path $ExportRoot (Get-Date -Format "yyyyMMdd-HHmmss")
    New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
    Push-Location $install
    try { & node (Join-Path $install "scripts\export-uninstall-data.cjs") $exportRoot; if ($LASTEXITCODE -ne 0) { throw "Excel inventory export failed; no services or application files were removed." } } finally { Pop-Location }
  }
  $running = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$install*" }
  if ($running) { throw "Ora application processes are still running. Please retry after investigating." }
  Write-Status "stopping" "Preparation complete. Removing Ora services."
  $serviceExe = Join-Path $install "OraTimeTrackingService.exe"
  $runnerService = Get-Service -Name "OraTimeTrackingService" -ErrorAction SilentlyContinue
  $runnerWasRunning = $null -ne $runnerService -and $runnerService.Status -eq "Running"
  $updaterWasRunning = @("OraTrackingServiceUpdater", "OraTimeTrackingUpdater") | Where-Object { $service = Get-Service -Name $_ -ErrorAction SilentlyContinue; $null -ne $service -and $service.Status -eq "Running" }
  $removedServices = @()
  try {
    foreach ($name in @("OraTrackingServiceUpdater", "OraTimeTrackingUpdater", "OraTimeTrackingService")) {
      $serviceBefore = Get-Service -Name $name -ErrorAction SilentlyContinue
      if ($serviceBefore) {
        if ($serviceBefore.Status -ne "Stopped") { Stop-Service -Name $name -Force; (Get-Service -Name $name).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(90)) }
        Remove-Service $name (Join-Path $install "$name.exe")
        $removedServices += $name
      }
    }
  } catch {
    foreach ($name in $removedServices) {
      $exe = Join-Path $install "$name.exe"
      if (Test-Path -LiteralPath $exe) {
        & $exe install
        if ($LASTEXITCODE -eq 0 -and $name -eq "OraTimeTrackingService" -and $runnerWasRunning) { & $exe start }
        if ($LASTEXITCODE -eq 0 -and $name -in $updaterWasRunning) { & $exe start }
      }
    }
    throw
  }
  Write-Status "removing" "Ora services removed. Removing application files."
  $deletionExe = Join-Path (Split-Path -Parent $StatusPath) "deletion\$serviceName.exe"
  $lockPath = Join-Path (Split-Path -Parent $StatusPath) "deletion.lock"
  Remove-Item -LiteralPath $install -Recurse -Force
  Write-Status "succeeded" ("Ora was removed." + $(if ($exportRoot) { " Excel export: $exportRoot." } else { "" }) + $(if ($dataRoot) { " Preserved data: $dataRoot" } else { "" }))
  Start-Sleep -Seconds 3
  if (Test-Path -LiteralPath $deletionExe) {
    & $deletionExe uninstall
    if ($LASTEXITCODE -ne 0) {
      Write-Status "failed" "Ora application files were removed, but the deletion service remains registered. Remove OraTimeTrackingDeletion from Windows Services as Administrator."
      exit 1
    }
  }
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
} catch {
  Write-Status "failed" ("Uninstall stopped safely: " + $_.Exception.Message)
  exit 1
}
