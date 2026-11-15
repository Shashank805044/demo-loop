<#
  Starts the whole app (API + website) and opens it in the browser.
  Usage:  .\start.ps1        (stop it again with .\stop.ps1)

  Claude API key (needed for AI scoring, smart search and collecting questions):
    1. the ANTHROPIC_API_KEY environment variable, or
    2. a line  ANTHROPIC_API_KEY=sk-ant-...  in backend\InterviewHub.Api\.env.local  (git-ignored)
  Without a key the app still runs: browsing, search and login work, AI features do not.
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$api  = Join-Path $root 'backend\InterviewHub.Api'
$web  = Join-Path $root 'frontend'
$run  = Join-Path $root '.run'
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($tool in 'dotnet', 'node', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed or not on PATH." }
}

# --- Claude API key: environment first, then the git-ignored local file ---
if (-not $env:ANTHROPIC_API_KEY) {
    $envFile = Join-Path $api '.env.local'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$') { $env:ANTHROPIC_API_KEY = $Matches[1].Trim('"', "'") }
        }
    }
}
if ($env:ANTHROPIC_API_KEY) { Write-Host 'Claude API key: found' -ForegroundColor Green }
else { Write-Warning 'No ANTHROPIC_API_KEY: AI scoring, smart search and collecting are disabled.' }

function Test-Listening([int]$port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# --- Website dependencies (first run only) ---
if (-not (Test-Path (Join-Path $web 'node_modules'))) {
    Write-Host 'Installing website dependencies (first run)...'
    Push-Location $web; npm install; Pop-Location
}

# --- API ---
if (Test-Listening 5137) { Write-Host 'API already running on :5137' }
else {
    Write-Host 'Starting API...'
    Start-Process dotnet -ArgumentList 'run', '--urls', 'http://localhost:5137' -WorkingDirectory $api `
        -RedirectStandardOutput (Join-Path $run 'api.log') -RedirectStandardError (Join-Path $run 'api.err.log') -WindowStyle Hidden
}

# --- Website ---
if (Test-Listening 5173) { Write-Host 'Website already running on :5173' }
else {
    Write-Host 'Starting website...'
    Start-Process npm.cmd -ArgumentList 'run', 'dev', '--', '--port', '5173', '--strictPort' -WorkingDirectory $web `
        -RedirectStandardOutput (Join-Path $run 'web.log') -RedirectStandardError (Join-Path $run 'web.err.log') -WindowStyle Hidden
}

# --- Wait until both answer ---
function Wait-Url([string]$url, [string]$name) {
    for ($i = 0; $i -lt 90; $i++) {
        try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return }
        catch { Start-Sleep -Seconds 1 }
    }
    throw "$name did not start in time. See the logs in $run"
}
Wait-Url 'http://localhost:5137/api/topics' 'API'
Wait-Url 'http://localhost:5173/' 'Website'

Write-Host ''
Write-Host 'Interview Hub is running:  http://localhost:5173' -ForegroundColor Cyan
Write-Host 'Stop it with:  .\stop.ps1'
Start-Process 'http://localhost:5173'
