# Interactive elevated Ora uninstaller for manual recovery and maintenance.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$serviceName = "OraTimeTrackingService"
$serviceNames = @("OraTrackingServiceUpdater", "OraTimeTrackingUpdater", "OraTimeTrackingService")
$updaterNames = @("OraTrackingServiceUpdater", "OraTimeTrackingUpdater")
$deletionServiceName = "OraTimeTrackingDeletion"
$installRoot = Join-Path $env:APPDATA "Ora"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run uninstall.cmd as Administrator to remove the Windows service and application." }
if (-not (Test-Path (Join-Path $installRoot "package.json"))) { throw "Ora installation was not found at $installRoot. Nothing was removed." }
Write-Host "This removes Ora from: $installRoot" -ForegroundColor Yellow
Write-Host "This does not remove Ora Desktop. Excel inventory workbooks are always exported before removal."
do { $keepAnswer = (Read-Host "Keep application data (.env, SQLite database, backups, and custom logos) after uninstall? [Y/N]").Trim() } until ($keepAnswer -match '^(?i:Y|N|YES|NO)$')
$keepData = $keepAnswer -match '^(?i:Y|YES)$'
do { $exportAnswer = (Read-Host "Create separate Excel workbooks for projects, teams, and people? [Y/N]").Trim() } until ($exportAnswer -match '^(?i:Y|N|YES|NO)$')
$createExcel = $exportAnswer -match '^(?i:Y|YES)$'
$confirm = (Read-Host "Type YES to confirm complete Ora uninstall").Trim()
if ($confirm -cne "YES") { Write-Host "Cancelled. Nothing was changed."; exit 0 }

$dbPath = Join-Path $installRoot "prisma\ORA.db"
if (-not (Test-Path -LiteralPath $dbPath)) { throw "Database is missing; refusing to uninstall." }
foreach ($suffix in @("-wal", "-shm")) { if (Test-Path -LiteralPath "$dbPath$suffix") { throw "SQLite sidecar exists; investigate before retrying." } }
$running = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$installRoot*" }
if ($running) { throw "Ora is still running (PID $($running.ProcessId)); refusing to remove its database." }
$wrappers = $serviceNames
foreach ($name in $wrappers) { if ((Get-Service -Name $name -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $installRoot "$name.exe"))) { throw "Service wrapper is missing for $name; refusing to remove application files." } }
$documentsRoot = Join-Path $env:USERPROFILE "Documents"
$dataRoot = $null
if ($keepData) {
  $dataRoot = Join-Path $documentsRoot ("Ora-Uninstall-Data-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
  foreach ($relative in @(".env", "prisma\ORA.db", "prisma\ORA_Backup.db", "public\custom")) {
    $source = Join-Path $installRoot $relative
    if (Test-Path -LiteralPath $source) { $destination = Join-Path $dataRoot $relative; New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null; Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force }
  }
  if (-not (Test-Path (Join-Path $dataRoot ".env"))) { throw "Preserved .env verification failed. Original files were not deleted." }
  $copyDb = Join-Path $dataRoot "prisma\ORA.db"
  if (-not (Test-Path $copyDb) -or (Get-FileHash $dbPath -Algorithm SHA256).Hash -ne (Get-FileHash $copyDb -Algorithm SHA256).Hash) { throw "Preserved database verification failed. Original files were not deleted." }
}
$exportRoot = $null
if ($createExcel) {
  $exportRoot = Join-Path $documentsRoot ("Ora-Uninstall-Export-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
  Push-Location $installRoot
  try { & node (Join-Path $installRoot "scripts\export-uninstall-data.cjs") $exportRoot; if ($LASTEXITCODE -ne 0) { throw "Excel export failed; no services or application files were removed." } } finally { Pop-Location }
}

$runner = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$runnerWasRunning = $null -ne $runner -and $runner.Status -eq "Running"
$updaterWasRunning = @($updaterNames | Where-Object { $s = Get-Service -Name $_ -ErrorAction SilentlyContinue; $null -ne $s -and $s.Status -eq "Running" })
$removed = @()
try {
  foreach ($name in $serviceNames) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($service) {
      if ($service.Status -ne "Stopped") { Stop-Service -Name $name -Force; (Get-Service -Name $name).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(90)) }
      $exe = Join-Path $installRoot "$name.exe"
      & $exe uninstall
      if ($LASTEXITCODE -ne 0) { throw "Could not remove service $name." }
      $removed += $name
    }
  }
} catch {
  foreach ($name in $removed) {
    $exe = Join-Path $installRoot "$name.exe"
    if (Test-Path $exe) { & $exe install; if ($LASTEXITCODE -eq 0 -and $name -eq $serviceName -and $runnerWasRunning) { & $exe start }; if ($LASTEXITCODE -eq 0 -and $name -in $updaterWasRunning) { & $exe start } }
  }
  throw
}
$deletionRoot = Join-Path $env:ProgramData "Ora\deletion"
$deletionStatus = Join-Path $env:ProgramData "Ora\deletion-status.json"
$deletionStatusBackup = "$deletionStatus.manual-uninstall-backup"
if (Test-Path -LiteralPath $deletionStatus) { Copy-Item -LiteralPath $deletionStatus -Destination $deletionStatusBackup -Force }
Remove-Item -LiteralPath $installRoot -Recurse -Force
if (Get-Service -Name $deletionServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $deletionServiceName -Force -ErrorAction SilentlyContinue
  $deletionExe = Join-Path $deletionRoot "$deletionServiceName.exe"
  if (-not (Test-Path -LiteralPath $deletionExe)) { throw "Ora files are removed, but the deletion service wrapper is missing. Remove $deletionServiceName from Windows Services as Administrator." }
  & $deletionExe uninstall
  if ($LASTEXITCODE -ne 0) { throw "Ora files are removed, but $deletionServiceName could not be deregistered. Remove it from Windows Services as Administrator." }
}
Remove-Item -LiteralPath $deletionRoot -Recurse -Force -ErrorAction SilentlyContinue
if (Get-Service -Name $deletionServiceName -ErrorAction SilentlyContinue) { throw "Ora files are removed but the deletion service is still registered. Status retained at $deletionStatusBackup." }
Remove-Item -LiteralPath $deletionStatus -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $deletionStatusBackup -Force -ErrorAction SilentlyContinue
Write-Host "Ora has been removed. Excel export: $exportRoot" -ForegroundColor Green
if ($keepData) { Write-Host "Application data retained in: $dataRoot" }
