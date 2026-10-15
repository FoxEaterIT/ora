[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet("status", "start")][string]$Operation,
  [string]$PipeName = "OraTrackingServiceUpdater",
  [int]$TimeoutMilliseconds = 1500
)
$pipe = [IO.Pipes.NamedPipeClientStream]::new(".", $PipeName, [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::None)
try {
  $pipe.Connect($TimeoutMilliseconds)
  $writer = [IO.StreamWriter]::new($pipe, [Text.Encoding]::UTF8, 1024, $true); $writer.AutoFlush = $true
  $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8, $false, 1024, $true)
  $writer.WriteLine((@{ operation = $Operation } | ConvertTo-Json -Compress))
  $line = $reader.ReadLine()
  if (-not $line) { throw "Updater service returned no response." }
  $line
} finally { $pipe.Dispose() }
