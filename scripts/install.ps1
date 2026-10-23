# Ora installer for Windows.
# Installs the application under %APPDATA%\Ora and prepares Node.js, npm, .env, and SQLite.
# Existing configuration is preserved except for the explicitly selected listener port.

param([switch]$InstalledCopy)

$ErrorActionPreference = "Stop"
$MinimumNodeMajor = 20
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run install.cmd as Administrator to install Ora as a Windows service."
}

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Test-PortAvailable([int]$Port) {
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch { return $false }
  finally { if ($listener) { $listener.Stop() } }
}

function Get-ConfiguredPort([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $match = [regex]::Match([System.IO.File]::ReadAllText($Path), '(?m)^PORT="?(\d+)"?\s*$')
  if (-not $match.Success) { return $null }
  return [int]$match.Groups[1].Value
}

function Select-InstallPort([string]$EnvPath) {
  $existingPort = Get-ConfiguredPort $EnvPath
  $defaultPort = if ($null -ne $existingPort -and $existingPort -ge 1 -and $existingPort -le 65535) { $existingPort } else { 33333 }
  while ($true) {
    $inputPort = Read-Host "Enter the Ora HTTP port (default $defaultPort; type Q to cancel)"
    if ($inputPort -match '^[qQ]$') { throw "Installation cancelled by user." }
    if ([string]::IsNullOrWhiteSpace($inputPort)) { $port = $defaultPort }
    elseif ($inputPort -match '^\d+$' -and [long]$inputPort -ge 1 -and [long]$inputPort -le 65535) { $port = [int]$inputPort }
    else { Write-Warning "Enter a TCP port between 1 and 65535."; continue }
    if (-not (Test-PortAvailable $port)) { Write-Warning "Port $port is already bound. Choose another port."; continue }
    return $port
  }
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
    if (Test-Path $installRoot) {
      $existingFiles = @(Get-ChildItem -LiteralPath $installRoot -Force -ErrorAction SilentlyContinue)
      $existingDb = Join-Path $installRoot "prisma\ORA.db"
      if ($existingFiles.Count -gt 0 -and (Test-Path $existingDb)) {
        throw "An Ora database already exists at $installRoot. Refusing to overwrite an existing installation. Use the updater for installed copies."
      }
      if ($existingFiles.Count -gt 0) {
        throw "$installRoot already exists and is not empty. Move or back up its contents before installing from this workspace."
      }
    }
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    $robocopy = Get-Command robocopy -ErrorAction SilentlyContinue
    if (-not $robocopy) { throw "robocopy is required to copy Ora to the installation folder." }
    & robocopy $sourceRoot $installRoot /E /XD node_modules .next .git /XF .env *.db *.db-wal *.db-shm *.tsbuildinfo
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
if (-not (Test-Path $envFile)) {
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

$serviceName = "OraTimeTrackingService"
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$configuredPort = Get-ConfiguredPort $envFile
if ($existingService) {
  if ($null -eq $configuredPort -or $configuredPort -lt 1 -or $configuredPort -gt 65535) { throw "Existing service has no valid PORT in .env. Repair the configuration before running the installer." }
  $port = $configuredPort
  Write-Host "Preserving existing Ora port $port."
} else {
  $port = Select-InstallPort $envFile
  $envContent = [System.IO.File]::ReadAllText($envFile)
  if ($envContent -match '(?m)^PORT=') { $envContent = [regex]::Replace($envContent, '(?m)^PORT=.*$', "PORT=`"$port`"") }
  else { $envContent = $envContent.TrimEnd() + "`r`nPORT=`"$port`"`r`n" }
  [System.IO.File]::WriteAllText($envFile, $envContent, (New-Object System.Text.UTF8Encoding $false))
}

Write-Step "Checking existing services, port, and database"
$updaterServiceName = "OraTrackingServiceUpdater"
$existingUpdater = Get-Service -Name $updaterServiceName -ErrorAction SilentlyContinue
if ($existingService -and -not $existingService.Status.Equals("Stopped")) {
  if (-not $InstalledCopy) { throw "$serviceName already exists. Use the updater for installations instead of reinstalling over the running service." }
  throw "$serviceName must be stopped before the installed-copy installer runs."
}
if ($existingUpdater -and $existingUpdater.Status -ne "Stopped") {
  throw "$updaterServiceName is running. Stop it before running the installer."
}
if ($existingService -and -not (Test-PortAvailable $port)) {
  throw "Configured port $port is occupied while $serviceName is stopped. Identify the listener and repair the configuration before retrying."
}
$dbDirectory = Join-Path $root "prisma"
$dbPath = Join-Path $dbDirectory "ORA.db"
if ($existingService -and -not (Test-Path $dbPath)) { throw "Existing Ora service is registered but the database is missing: $dbPath" }
if (-not $existingService -and (Test-Path $dbPath)) { throw "Database already exists without a registered Ora service: $dbPath. Refusing to initialize or overwrite it." }
New-Item -ItemType Directory -Path $dbDirectory -Force | Out-Null
Write-Host "Ora database path: $dbPath"

Write-Step "Building production app and database schema"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }

Write-Step "Installing Windows service"
$serviceExe = Join-Path $root "$serviceName.exe"
$serviceConfig = Join-Path $root "$serviceName.xml"
if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
  if ($InstalledCopy) { throw "Run the installer from its downloaded source folder, not the installed copy, to register the Windows service." }
  $winSwVersion = "2.12.0"
  $winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $winSwUrl -OutFile $serviceExe -TimeoutSec 60
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $servicePort = $port
  $xml = @"
<service>
  <id>$serviceName</id>
  <name>Ora Time Tracking</name>
  <description>Ora time tracking application</description>
  <executable>$node</executable>
  <arguments>node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $servicePort</arguments>
  <workingdirectory>$root</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>$root\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
</service>
"@
  [System.IO.File]::WriteAllText($serviceConfig, $xml, (New-Object System.Text.UTF8Encoding $false))
  & $serviceExe install
  if ($LASTEXITCODE -ne 0) { throw "Could not install $serviceName." }
  & $serviceExe start
  if ($LASTEXITCODE -ne 0) { throw "Could not start $serviceName." }
} else {
  Write-Host "$serviceName already exists; leaving the existing service configuration unchanged."
  if ((Get-Service -Name $serviceName).Status -ne "Running") { Start-Service -Name $serviceName }
}

$updaterServiceName = "OraTrackingServiceUpdater"
$updaterExe = Join-Path $root "$updaterServiceName.exe"
$updaterXml = Join-Path $root "$updaterServiceName.xml"
if (-not (Get-Service -Name $updaterServiceName -ErrorAction SilentlyContinue)) {
  if ($InstalledCopy) { throw "Run install.cmd from its downloaded source folder to register $updaterServiceName." }
  $winSwVersion = "2.12.0"
  $winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $winSwUrl -OutFile $updaterExe -TimeoutSec 60
  $updaterStatus = Join-Path $env:ProgramData "Ora\updater-status.json"
  $updaterLog = Join-Path $root "logs\updater"
  New-Item -ItemType Directory -Path (Split-Path -Parent $updaterStatus) -Force | Out-Null
  New-Item -ItemType Directory -Path $updaterLog -Force | Out-Null
  $escapedRoot = [System.Security.SecurityElement]::Escape($root)
  $escapedStatus = [System.Security.SecurityElement]::Escape($updaterStatus)
  $xml = @"
<service>
  <id>$updaterServiceName</id>
  <name>Ora Tracking Service Updater</name>
  <description>Privileged local updater broker for Ora Time Tracking</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;$escapedRoot\scripts\updater-agent.ps1&quot; -InstallPath &quot;$escapedRoot&quot; -StatusPath &quot;$escapedStatus&quot;</arguments>
  <workingdirectory>$escapedRoot</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>$updaterLog</logpath>
</service>
"@
  [System.IO.File]::WriteAllText($updaterXml, $xml, (New-Object System.Text.UTF8Encoding $false))
  & $updaterExe install
  if ($LASTEXITCODE -ne 0) { throw "Could not install $updaterServiceName." }
  & $updaterExe start
  if ($LASTEXITCODE -ne 0) { throw "Could not start $updaterServiceName." }
} elseif ((Get-Service -Name $updaterServiceName).Status -ne "Running") {
  Start-Service -Name $updaterServiceName
}

$deletionServiceName = "OraTimeTrackingDeletion"
$deletionRoot = Join-Path $env:ProgramData "Ora\deletion"
$deletionExe = Join-Path $deletionRoot "$deletionServiceName.exe"
$deletionXml = Join-Path $deletionRoot "$deletionServiceName.xml"
if (-not (Get-Service -Name $deletionServiceName -ErrorAction SilentlyContinue)) {
  if ($InstalledCopy -and -not (Test-Path $deletionExe)) { throw "Run install.cmd from its downloaded source folder to register $deletionServiceName." }
  foreach ($script in @("deletion-agent.ps1", "deletion-run.ps1")) {
    if (-not (Test-Path (Join-Path $root "scripts\$script"))) { throw "Required deletion service script is missing: $script" }
  }
  New-Item -ItemType Directory -Path $deletionRoot -Force | Out-Null
  & icacls.exe $deletionRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion service files." }
  if (-not (Test-Path $deletionExe)) { Copy-Item -LiteralPath $serviceExe -Destination $deletionExe -Force }
  & icacls.exe $deletionExe /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion service executable." }
  $deletionStatus = Join-Path $env:ProgramData "Ora\deletion-status.json"
  $deletionLog = Join-Path $root "logs\deletion"
  New-Item -ItemType Directory -Path (Split-Path -Parent $deletionStatus) -Force | Out-Null
  & icacls.exe (Split-Path -Parent $deletionStatus) /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion status files." }
  $installProfile = Split-Path (Split-Path (Split-Path $root -Parent) -Parent) -Parent
  $deletionExport = Join-Path $installProfile "Documents\Ora-Uninstall-Exports"
  New-Item -ItemType Directory -Path $deletionExport -Force | Out-Null
  New-Item -ItemType Directory -Path $deletionLog -Force | Out-Null
  & icacls.exe $deletionRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion service files." }
  $escapedRoot = [System.Security.SecurityElement]::Escape($root)
  $escapedDeletionRoot = [System.Security.SecurityElement]::Escape($deletionRoot)
  $escapedStatus = [System.Security.SecurityElement]::Escape($deletionStatus)
  $escapedExport = [System.Security.SecurityElement]::Escape($deletionExport)
  $deletionAgent = Join-Path $deletionRoot "deletion-agent.ps1"
  $deletionWorker = Join-Path $deletionRoot "deletion-run.ps1"
  Copy-Item -LiteralPath (Join-Path $root "scripts\deletion-agent.ps1") -Destination $deletionAgent -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\deletion-run.ps1") -Destination $deletionWorker -Force
  & icacls.exe $deletionAgent /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion broker script." }
  & icacls.exe $deletionWorker /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion worker script." }
  $xml = @"
<service>
  <id>$deletionServiceName</id>
  <name>Ora Time Tracking Deletion</name>
  <description>Constrained local broker for owner-requested Ora uninstall</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;$escapedDeletionRoot\deletion-agent.ps1&quot; -InstallPath &quot;$escapedRoot&quot; -StatusPath &quot;$escapedStatus&quot; -ExportRoot &quot;$escapedExport&quot;</arguments>
  <workingdirectory>$escapedDeletionRoot</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>$deletionLog</logpath>
</service>
"@
  [System.IO.File]::WriteAllText($deletionXml, $xml, [System.Text.UTF8Encoding]::new($false))
  if ($InstalledCopy) {
    & $deletionExe refresh
    if ($LASTEXITCODE -ne 0) { throw "Could not refresh $deletionServiceName." }
  }
  if (-not $InstalledCopy) {
    & $deletionExe install
    if ($LASTEXITCODE -ne 0) { throw "Could not install $deletionServiceName." }
    & $deletionExe start
    if ($LASTEXITCODE -ne 0) { throw "Could not start $deletionServiceName." }
  } else {
    Start-Service -Name $deletionServiceName
  }
} else {
  $deletionStatus = Join-Path $env:ProgramData "Ora\deletion-status.json"
  New-Item -ItemType Directory -Path (Split-Path -Parent $deletionStatus) -Force | Out-Null
  & icacls.exe (Split-Path -Parent $deletionStatus) /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion status files." }
  $installProfile = Split-Path (Split-Path (Split-Path $root -Parent) -Parent) -Parent
  $deletionExport = Join-Path $installProfile "Documents\Ora-Uninstall-Exports"
  $deletionLog = Join-Path $root "logs\deletion"
  New-Item -ItemType Directory -Path $deletionExport -Force | Out-Null
  New-Item -ItemType Directory -Path $deletionLog -Force | Out-Null
  & icacls.exe $deletionRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion service files." }
  $escapedRoot = [System.Security.SecurityElement]::Escape($root)
  $escapedDeletionRoot = [System.Security.SecurityElement]::Escape($deletionRoot)
  $escapedStatus = [System.Security.SecurityElement]::Escape($deletionStatus)
  $escapedExport = [System.Security.SecurityElement]::Escape($deletionExport)
  Copy-Item -LiteralPath (Join-Path $root "scripts\deletion-agent.ps1") -Destination (Join-Path $deletionRoot "deletion-agent.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\deletion-run.ps1") -Destination (Join-Path $deletionRoot "deletion-run.ps1") -Force
  & icacls.exe $deletionRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the deletion service files." }
  foreach ($file in @("deletion-agent.ps1", "deletion-run.ps1")) {
    & icacls.exe (Join-Path $deletionRoot $file) /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to $file." }
  }
  $xml = @"
<service>
  <id>$deletionServiceName</id>
  <name>Ora Time Tracking Deletion</name>
  <description>Constrained local broker for owner-requested Ora uninstall</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;$escapedDeletionRoot\deletion-agent.ps1&quot; -InstallPath &quot;$escapedRoot&quot; -StatusPath &quot;$escapedStatus&quot; -ExportRoot &quot;$escapedExport&quot;</arguments>
  <workingdirectory>$escapedDeletionRoot</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>$deletionLog</logpath>
</service>
"@
  [System.IO.File]::WriteAllText($deletionXml, $xml, [System.Text.UTF8Encoding]::new($false))
  & $deletionExe refresh
  if ($LASTEXITCODE -ne 0) { throw "Could not refresh $deletionServiceName." }
  if ((Get-Service -Name $deletionServiceName).Status -ne "Running") { Start-Service -Name $deletionServiceName }
}

Write-Host ""
Write-Host "Ora is ready." -ForegroundColor Green
Write-Host "Install folder: $root"
Write-Host "Then open:      http://localhost:$port"
Write-Host "First visit:    http://localhost:$port/setup"
Write-Host "Windows service: $serviceName (installed and started)."
Write-Host "Updater service: $updaterServiceName (installed and started)."
