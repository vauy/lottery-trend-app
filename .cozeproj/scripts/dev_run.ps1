$ErrorActionPreference = "Stop"

function Stop-ProcessTree([int] $processId) {
  if ($processId -gt 0 -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    & taskkill.exe /PID $processId /T /F *> $null
  }
}

function Stop-ListeningProcess([int] $port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-ProcessTree $_ }
}

function Start-LoggedProcess([string] $workingDirectory, [string] $logFile, [string[]] $arguments, [hashtable] $environment) {
  $previousEnvironment = @{}
  foreach ($key in $environment.Keys) {
    $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process')
  }

  try {
    return Start-Process -FilePath "pnpm.cmd" -ArgumentList $arguments -WorkingDirectory $workingDirectory -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.error" -PassThru
  } finally {
    foreach ($key in $environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], 'Process')
    }
  }
}

$workspace = if ($env:COZE_WORKSPACE_PATH) { $env:COZE_WORKSPACE_PATH } else { (Get-Location).Path }
$serverPort = if ($env:SERVER_PORT) { [int] $env:SERVER_PORT } else { 9091 }
$expoPort = if ($env:DEPLOY_RUN_PORT) { [int] $env:DEPLOY_RUN_PORT } elseif ($env:EXPO_PORT) { [int] $env:EXPO_PORT } else { 5000 }
$logDirectory = if ($env:COZE_LOG_DIR) { $env:COZE_LOG_DIR } else { Join-Path $workspace "logs" }
$serverLog = Join-Path $logDirectory "server.log"
$clientLog = Join-Path $logDirectory "client.log"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

Stop-ListeningProcess $serverPort
Stop-ListeningProcess $expoPort

$webUrl = if ($env:COZE_PROJECT_DOMAIN_DEFAULT) {
  $env:COZE_PROJECT_DOMAIN_DEFAULT
} elseif ($env:COZE_HARDWARE_DID) {
  "https://preview-$($env:COZE_HARDWARE_DID)-$expoPort.dev.coze.site"
} else {
  "http://127.0.0.1:$serverPort"
}

$sharedEnvironment = @{
  EXPO_PUBLIC_BACKEND_BASE_URL = $webUrl
  EXPO_PACKAGER_PROXY_URL = $webUrl
  EXPO_PUBLIC_COZE_PROJECT_ID = $env:COZE_PROJECT_ID
}

Write-Host "Starting server on port $serverPort..."
$server = Start-LoggedProcess (Join-Path $workspace "server") $serverLog @("exec", "tsx", "watch", "./src/index.ts") (@{ NODE_ENV = "development"; PORT = "$serverPort" })

Write-Host "Starting Expo on port $expoPort..."
$expoEnvironment = @{}
$sharedEnvironment.GetEnumerator() | ForEach-Object { $expoEnvironment[$_.Key] = $_.Value }
$expoEnvironment.EXPO_NO_DEPENDENCY_VALIDATION = "1"
$expo = Start-LoggedProcess (Join-Path $workspace "client") $clientLog @("exec", "expo", "start", "--port", "$expoPort") $expoEnvironment

Start-Sleep -Seconds 8
if ((Test-Path $clientLog) -and (Select-String -Path $clientLog -Pattern "TypeError: fetch failed" -Quiet)) {
  Write-Host "Expo startup detected a network error; retrying in offline mode."
  Stop-ProcessTree $expo.Id
  $expoEnvironment.EXPO_OFFLINE = "1"
  $expo = Start-LoggedProcess (Join-Path $workspace "client") $clientLog @("exec", "expo", "start", "--port", "$expoPort") $expoEnvironment
}

Write-Host "Services started. Server PID: $($server.Id), Expo PID: $($expo.Id)"
Write-Host "EXPO_PUBLIC_BACKEND_BASE_URL=$webUrl"
