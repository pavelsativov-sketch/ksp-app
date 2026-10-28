$ErrorActionPreference = "Stop"

# Keeps the browser runner outside the Codex terminal lifetime.  It deliberately
# reads the signing secret from the current Windows user's environment, never
# from a checked-in file or command-line argument.
$root = Split-Path -Parent $PSScriptRoot
$runnerScript = Join-Path $root "scripts\local-browser-runner.mjs"
$tunnelExe = Join-Path $root ".tools\cloudflared.exe"
$runnerLog = Join-Path $env:TEMP "mekty-browser-runner.log"
$runnerErrorLog = Join-Path $env:TEMP "mekty-browser-runner-error.log"
$tunnelLog = Join-Path $env:TEMP "mekty-browser-tunnel.log"
$tunnelErrorLog = Join-Path $env:TEMP "mekty-browser-tunnel-error.log"

if (-not (Test-Path -LiteralPath $tunnelExe)) {
  throw "Не найден Cloudflare Tunnel: $tunnelExe"
}

$secret = [Environment]::GetEnvironmentVariable("BROWSER_RPC_SECRET", "User")
if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -lt 32) {
  throw "Не задан локальный секрет BROWSER_RPC_SECRET"
}

if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3111 -InformationLevel Quiet)) {
  $runnerArgs = "`"$runnerScript`""
  Start-Process -FilePath "node.exe" -ArgumentList $runnerArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $runnerLog -RedirectStandardError $runnerErrorLog
}

$started = Get-Date
while (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3111 -InformationLevel Quiet)) {
  if (((Get-Date) - $started).TotalSeconds -gt 30) { throw "Локальный браузер не запустился" }
  Start-Sleep -Seconds 1
}

# A quick tunnel is free.  Its address changes after a restart, so extract it
# from the log and publish only that address as a Vercel production secret.
Start-Process -FilePath $tunnelExe -ArgumentList "tunnel --url http://127.0.0.1:3111 --no-autoupdate" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrorLog
$url = $null
$started = Get-Date
while (-not $url) {
  if ((Test-Path -LiteralPath $tunnelLog) -or (Test-Path -LiteralPath $tunnelErrorLog)) {
    $match = Select-String -LiteralPath @($tunnelLog, $tunnelErrorLog) -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($match) { $url = $match.Matches[0].Value }
  }
  if (((Get-Date) - $started).TotalSeconds -gt 45) { throw "Cloudflare Tunnel не выдал адрес" }
  Start-Sleep -Seconds 1
}

$rpcUrl = "$url/_agent/browser"
$rpcUrl | npx vercel env add BROWSER_RPC_URL production --sensitive --force --yes --project ksp-app --scope pavelsativov-sketchs-projects
if ($LASTEXITCODE -ne 0) { throw "Не удалось обновить адрес runner в Vercel" }

# Publish the committed runner integration only.  Unrelated local work remains
# on this PC and is not uploaded just because the tunnel restarted.
$releaseDir = Join-Path $env:TEMP ("mekty-local-runner-release-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $releaseDir | Out-Null
git -C $root archive HEAD | tar -xf - -C $releaseDir
Push-Location $releaseDir
try {
  npx vercel deploy --prod --yes --project ksp-app --scope pavelsativov-sketchs-projects
  if ($LASTEXITCODE -ne 0) { throw "Не удалось опубликовать обновление Vercel" }
} finally {
  Pop-Location
}
