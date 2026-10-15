# Local IPC broker for the separately installed Ora updater service.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)][string]$InstallPath,
    [Parameter(Mandatory = $true)][string]$StatusPath,
    [string]$PipeName = "OraTrackingServiceUpdater"
)

# Auto-detect installation path if not provided
if (-not $InstallPath) {
    $install = Join-Path $env:APPDATA "Ora"
    if (-not (Test-Path (Join-Path $install "package.json"))) {
        # Check if OraTimeTrackingService is running and get its working directory
        $service = Get-Service -Name "OraTimeTrackingService" -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Running") {
            $install = (Get-Item (Get-WmiObject Win32_Service -Filter "Name='$service.Name'").PathName).DirectoryName
        }
        
        if (-not (Test-Path (Join-Path $install "package.json"))) {
            throw "Cannot determine Ora installation path. Please ensure Ora is installed at %APPDATA%\Ora or specify -InstallPath"
        }
    }
} else {
    $install = [System.IO.Path]::GetFullPath($InstallPath)
}

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $install "scripts\update.ps1"
$mutex = [Threading.Mutex]::new($false, "Global\OraTrackingServiceUpdaterJob")
$lockFile = Join-Path (Split-Path -Parent $StatusPath) "updater-job.lock"
$pipeSecurity = [System.IO.Pipes.PipeSecurity]::new()
$systemSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-18")
$adminsSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
$pipeSecurity.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($systemSid, [System.IO.Pipes.PipeAccessRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow))
$pipeSecurity.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($adminsSid, [System.IO.Pipes.PipeAccessRights]::ReadWrite, [Security.AccessControl.AccessControlType]::Allow))

function Write-Status([string]$Phase, [string]$Message, [string]$Version = "") {
    $value = [ordered]@{ phase = $Phase; message = $Message; targetVersion = $Version; updatedAt = [DateTime]::UtcNow.ToString("o") }
    $directory = Split-Path -Parent $StatusPath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temp = "$StatusPath.tmp"
    [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $StatusPath -Force
}
function Read-Status {
    if (Test-Path -LiteralPath $StatusPath) { return Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json }
    return @{ phase = "idle"; message = ""; targetVersion = ""; updatedAt = [DateTime]::UtcNow.ToString("o") }
}

while ($true) {
    $pipe = $null
    try {
        # Pipe clients are restricted to the local machine; the web service runs under the same service identity.
        $pipe = [IO.Pipes.NamedPipeServerStream]::new($PipeName, [IO.Pipes.PipeDirection]::InOut, 4, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::None, 4096, 4096, $pipeSecurity)
        $pipe.WaitForConnection()
        $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8, $false, 1024, $true)
        $writer = [IO.StreamWriter]::new($pipe, [Text.Encoding]::UTF8, 1024, $true); $writer.AutoFlush = $true
        $request = $reader.ReadLine() | ConvertFrom-Json
        if ($request.operation -eq "status") {
            $writer.WriteLine((Read-Status | ConvertTo-Json -Compress))
        } elseif ($request.operation -eq "start") {
            $owns = $false
            try {
                $lock = [IO.File]::Open($lockFile, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
                $owns = $true
            } catch { $owns = $false }
            if (-not $owns) { $writer.WriteLine('{"accepted":false,"reason":"busy"}') }
            else {
                $status = Read-Status
                if ($status.phase -in @("queued", "downloading", "verifying", "building", "stopping", "migrating", "activating", "restarting")) {
                    $writer.WriteLine('{"accepted":false,"reason":"busy"}'); $lock.Dispose()
                } else {
                    Write-Status "queued" "Update accepted. Ora will be briefly unavailable during activation."
                    $writer.WriteLine('{"accepted":true}')
                    $task = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"", "-InstallPath", "`"$install`"", "-StatusPath", "`"$StatusPath`"") -WindowStyle Hidden -PassThru
                    # Release the lock when the updater exits; only the service launches this fixed script and fixed install path.
                    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "try { Wait-Process -Id $($task.Id) -ErrorAction Stop } finally { Remove-Item -LiteralPath '$lockFile' -Force -ErrorAction SilentlyContinue }") | Out-Null
                }
            }
        } else { $writer.WriteLine('{"error":"unsupported"}') }
    } catch {
        # Keep the broker available; clients receive no internal error details.
    } finally { if ($pipe) { $pipe.Dispose() } }
}