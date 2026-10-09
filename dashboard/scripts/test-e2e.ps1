$ErrorActionPreference = "Stop"
$server = $null

function Test-Dashboard {
  try { Invoke-WebRequest "http://localhost:4175/" -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

try {
  if (-not (Test-Dashboard)) {
    $server = Start-Process node.exe -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "localhost", "--port", "4175") -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
    foreach ($attempt in 1..60) { if (Test-Dashboard) { break }; Start-Sleep -Milliseconds 500 }
    if (-not (Test-Dashboard)) { throw "Dashboard test server tidak siap." }
  }
  & node.exe node_modules/@playwright/test/cli.js test @args
  exit $LASTEXITCODE
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
