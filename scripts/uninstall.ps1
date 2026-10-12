# Ora Windows uninstaller. Exports project/team/user inventories before removing the installation.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$serviceName = "OraTimeTrackingService"
$installRoot = Join-Path $env:APPDATA "Ora"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run uninstall.cmd as Administrator to remove the Windows service and application."
}
if (-not (Test-Path (Join-Path $installRoot "package.json"))) {
  throw "Ora installation was not found at $installRoot. Nothing was removed."
}

Write-Host "This removes Ora from: $installRoot" -ForegroundColor Yellow
Write-Host "Project, team, and user inventories will be exported to separate Excel files before removal."
do {
  $keepAnswer = (Read-Host "Keep application data (.env, SQLite database, backups, and custom logos) after uninstall? [Y/N]").Trim()
} until ($keepAnswer -match '^(?i:Y|N|YES|NO)$')
$keepData = $keepAnswer -match '^(?i:Y|YES)$'
$confirm = Read-Host "Continue with uninstall? Type REMOVE to confirm"
if ($confirm -cne "REMOVE") { Write-Host "Cancelled. Nothing was changed."; exit 0 }

$exportRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) ("Ora-Uninstall-Export-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
$dbPath = Join-Path $installRoot "prisma\ORA.db"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$wasRunning = $null -ne $service -and $service.Status -eq "Running"
$serviceExe = Join-Path $installRoot "$serviceName.exe"
$serviceRemoved = $false

try {
  if ($wasRunning) {
    Write-Host "Stopping $serviceName..."
    Stop-Service -Name $serviceName -Force
    (Get-Service -Name $serviceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(90))
  }

  if ($service -and -not (Test-Path $serviceExe)) { throw "WinSW service executable is missing; refusing to remove the installation without deregistering the service." }

  $remaining = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$installRoot*" }
  if ($remaining) { throw "Ora is still running (PID $($remaining.ProcessId)); refusing to export or remove its database." }

  if (Test-Path $dbPath) {
    foreach ($suffix in @("-wal", "-shm")) {
      if (Test-Path "$dbPath$suffix") { throw "SQLite sidecar exists: $dbPath$suffix. Database was not exported; investigate before retrying." }
    }
    Push-Location $installRoot
    try {
      & node (Join-Path $installRoot "scripts\export-uninstall-data.cjs") $exportRoot
      if ($LASTEXITCODE -ne 0) { throw "Excel inventory export failed; the application data has not been deleted." }
    } finally { Pop-Location }
  } else {
    Write-Warning "ORA.db was not found. Inventory workbooks cannot be created; no application files have been deleted."
    throw "Database is missing; refusing to remove the installation without the requested Excel exports."
  }

  if ($service) {
    & $serviceExe uninstall
    if ($LASTEXITCODE -ne 0) { throw "Could not deregister $serviceName; the application files have not been deleted." }
    $serviceRemoved = $true
  }

  $dataRoot = Join-Path $exportRoot "Ora-data"
  if ($keepData) {
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    foreach ($relativePath in @(".env", "prisma\ORA.db", "prisma\ORA_Backup.db", "public\custom")) {
      $source = Join-Path $installRoot $relativePath
      if (Test-Path $source) {
        $destination = Join-Path $dataRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
      }
    }
    $copyDb = Join-Path $dataRoot "prisma\ORA.db"
    if (-not (Test-Path $copyDb) -or ((Get-FileHash $dbPath -Algorithm SHA256).Hash -ne (Get-FileHash $copyDb -Algorithm SHA256).Hash)) {
      throw "Preserved database copy verification failed; original installation data was not deleted."
    }
  }

  Remove-Item -LiteralPath $installRoot -Recurse -Force
  Write-Host "Ora has been removed. Excel exports: $exportRoot" -ForegroundColor Green
  if ($keepData) { Write-Host "Application data retained in: $dataRoot" }
} catch {
  if ($serviceRemoved -and (Test-Path $serviceExe)) {
    Write-Warning "Uninstall stopped before deleting the installation. Attempting to restore the Windows service."
    & $serviceExe install
    if ($LASTEXITCODE -eq 0 -and $wasRunning) { & $serviceExe start }
  } elseif ($service -and (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) -and $wasRunning) {
    Write-Warning "Uninstall stopped before deleting the installation. Restarting $serviceName."
    Start-Service -Name $serviceName
  }
  throw
}
