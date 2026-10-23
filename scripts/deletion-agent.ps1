# Constrained local broker for complete Ora service uninstall.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallPath,
  [Parameter(Mandatory = $true)][string]$StatusPath,
  [Parameter(Mandatory = $true)][string]$ExportRoot,
  [string]$PipeName = "OraTimeTrackingDeletion"
)
$ErrorActionPreference = "Stop"
$install = [IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92)
if (-not (Test-Path -LiteralPath (Join-Path $install "package.json"))) { throw "Pinned Ora installation is invalid." }
$deletionRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([char]92)
$installProfile = Split-Path (Split-Path (Split-Path $install -Parent) -Parent) -Parent
$expectedExportRoot = [IO.Path]::GetFullPath((Join-Path $installProfile "Documents\Ora-Uninstall-Exports")).TrimEnd([char]92)
$expectedStatusPath = [IO.Path]::GetFullPath((Join-Path $env:ProgramData "Ora\deletion-status.json"))
if ([IO.Path]::GetFullPath($InstallPath).TrimEnd([char]92) -ine [IO.Path]::GetFullPath((Join-Path $env:APPDATA "Ora")).TrimEnd([char]92)) { throw "Broker install path is not the fixed Ora application path." }
if ([IO.Path]::GetFullPath($StatusPath) -ine $expectedStatusPath) { throw "Deletion status path must be pinned to the Ora status file." }
$expectedDeletionRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramData "Ora\deletion")).TrimEnd([char]92)
if ($deletionRoot -ine $expectedDeletionRoot) { throw "Deletion broker must run from its pinned ProgramData location." }
if ($ExportRoot -ine $expectedExportRoot) { throw "Uninstall export path must be the fixed Ora export folder under Documents." }
$worker = Join-Path $deletionRoot "deletion-run.ps1"
if (-not (Test-Path -LiteralPath $worker)) { throw "Pinned deletion worker is missing." }
$pipeSecurity = [System.IO.Pipes.PipeSecurity]::new()
$systemSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-18")
$adminsSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
$pipeSecurity.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($systemSid, [System.IO.Pipes.PipeAccessRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
$pipeSecurity.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($adminsSid, [System.IO.Pipes.PipeAccessRights]::ReadWrite, [System.Security.AccessControl.AccessControlType]::Allow))
function Read-Status {
  if (Test-Path -LiteralPath $StatusPath) { return Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json }
  return @{ phase = "idle"; message = ""; updatedAt = [DateTime]::UtcNow.ToString("o") }
}
while ($true) {
  $pipe = $null
  try {
    $pipe = [IO.Pipes.NamedPipeServerStream]::new($PipeName, [IO.Pipes.PipeDirection]::InOut, 4, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::None, 4096, 4096, $pipeSecurity)
    $pipe.WaitForConnection()
    $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8, $false, 1024, $true)
    $writer = [IO.StreamWriter]::new($pipe, [Text.Encoding]::UTF8, 1024, $true); $writer.AutoFlush = $true
    $request = $reader.ReadLine() | ConvertFrom-Json
    if ($request.operation -eq "status") { $writer.WriteLine((Read-Status | ConvertTo-Json -Compress)) }
    elseif ($request.operation -eq "start" -and $request.confirmed -is [bool] -and $request.confirmed -and $request.keepData -is [bool] -and $request.createExcel -is [bool]) {
      $status = Read-Status
      if ($status.phase -in @("preparing", "stopping", "removing")) { $writer.WriteLine('{"accepted":false,"reason":"busy"}') }
      else {
        $lockPath = Join-Path (Split-Path -Parent $StatusPath) "deletion.lock"
        New-Item -ItemType Directory -Path (Split-Path -Parent $StatusPath) -Force | Out-Null
        $lock = $null
        try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) } catch { }
        if (-not $lock) { $writer.WriteLine('{"accepted":false,"reason":"busy"}') }
        else {
          $accepted = [ordered]@{ phase = "preparing"; message = "Uninstall request accepted; safety checks are starting."; updatedAt = [DateTime]::UtcNow.ToString("o") }
          $statusTemp = "$StatusPath.tmp"
          try {
            [IO.File]::WriteAllText($statusTemp, ($accepted | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
            Move-Item -LiteralPath $statusTemp -Destination $StatusPath -Force
          } catch {
            $lock.Dispose()
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
            throw
          }
          $arguments = @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $worker, "-InstallPath", $install, "-StatusPath", $StatusPath, "-ExportRoot", $ExportRoot, "-KeepData", $(if ($request.keepData) { "true" } else { "false" }), "-CreateExcel", $(if ($request.createExcel) { "true" } else { "false" }))
          try {
            $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru
            $writer.WriteLine('{"accepted":true}')
            $lock.Dispose()
            Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "try { Wait-Process -Id $($process.Id) } finally { Remove-Item -LiteralPath '$lockPath' -Force -ErrorAction SilentlyContinue }") | Out-Null
          } catch {
            if ($lock) { $lock.Dispose() }
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
            $failed = [ordered]@{ phase = "failed"; message = "Could not start the fixed uninstall worker."; updatedAt = [DateTime]::UtcNow.ToString("o") }
            [IO.File]::WriteAllText($StatusPath, ($failed | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
            $writer.WriteLine('{"accepted":false,"reason":"worker"}')
          }
        }
      }
    } else { $writer.WriteLine('{"accepted":false,"reason":"invalid"}') }
  } catch { }
  finally { if ($pipe) { $pipe.Dispose() } }
}
