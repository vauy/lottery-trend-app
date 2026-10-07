$ErrorActionPreference = "Stop"

$workspace = if ($env:COZE_WORKSPACE_PATH) { $env:COZE_WORKSPACE_PATH } else { (Get-Location).Path }
Set-Location $workspace

Write-Host "Installing Expo project dependencies..."
& pnpm install --registry=https://registry.npmmirror.com
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Expo project dependency installation failed."
}
