param([string]$Root = $PSScriptRoot, [string]$Node = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference = 'Stop'
$guard = New-Object System.Threading.Mutex($false, 'Local\HerdrMobileBridgeSupervisor')
if (-not $guard.WaitOne(0)) { $guard.Dispose(); exit }
try {
  while ($true) {
    $reachable = $false
    try { $reachable = (Invoke-WebRequest 'http://127.0.0.1:4317/' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch {}
    if ($reachable) { Start-Sleep -Seconds 15; continue }
    $child = Start-Process -FilePath $Node -ArgumentList ('"' + (Join-Path $Root 'server.mjs') + '"') -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Root '.local/bridge.out.log') -RedirectStandardError (Join-Path $Root '.local/bridge.err.log')
    $child.Id | Set-Content (Join-Path $Root '.local/bridge.pid')
    $child.WaitForExit()
    Start-Sleep -Seconds 15
  }
} finally { $guard.ReleaseMutex(); $guard.Dispose() }
