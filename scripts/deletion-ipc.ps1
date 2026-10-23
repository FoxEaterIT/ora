[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet("status", "start")][string]$Operation,
  [Parameter(Mandatory = $false)][ValidateSet("true", "false")][string]$KeepData = "false",
  [Parameter(Mandatory = $false)][ValidateSet("true", "false")][string]$CreateExcel = "true",
  [string]$PipeName = "OraTimeTrackingDeletion",
  [int]$TimeoutMilliseconds = 2000
)
$pipe = [IO.Pipes.NamedPipeClientStream]::new(".", $PipeName, [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::None)
try {
  $pipe.Connect($TimeoutMilliseconds)
  $writer = [IO.StreamWriter]::new($pipe, [Text.Encoding]::UTF8, 1024, $true); $writer.AutoFlush = $true
  $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8, $false, 1024, $true)
  $writer.WriteLine((@{ operation = $Operation; confirmed = ($Operation -eq "start"); keepData = ($KeepData -eq "true"); createExcel = ($CreateExcel -eq "true") } | ConvertTo-Json -Compress))
  $line = $reader.ReadLine()
  if (-not $line) { throw "Deletion service returned no response." }
  $line
} finally { $pipe.Dispose() }
