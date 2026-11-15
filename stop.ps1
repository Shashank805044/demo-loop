<#
  Stops the app. Only processes listening on the app's ports (5137 API, 5173 website) are stopped,
  so other node/dotnet programs on the machine are left alone.
#>
$pids = Get-NetTCPConnection -LocalPort 5137, 5173 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
if (-not $pids) { Write-Host 'Nothing is running.'; return }
foreach ($p in $pids) {
    $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Stopping $name ($p)"
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Write-Host 'Stopped.'
