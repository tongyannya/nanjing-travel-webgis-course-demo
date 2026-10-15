param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

Set-Location -LiteralPath $ProjectRoot
. (Join-Path $PSScriptRoot 'local_config.ps1')
$serviceConfig = Get-LocalServiceConfig -ProjectRoot $ProjectRoot
$Host.UI.RawUI.WindowTitle = '南京旅行规划 - 后端'
Write-Host "正在启动后端：http://$($serviceConfig.BackendHost):$($serviceConfig.BackendPort)" -ForegroundColor Cyan
Write-Host '停止服务：在本窗口按 Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

& (Join-Path $ProjectRoot 'backend\.venv\Scripts\python.exe') -m uvicorn app.main:app --app-dir backend --host $serviceConfig.BackendHost --port $serviceConfig.BackendPort --reload --no-access-log

Write-Host ''
Write-Host '后端已经停止。可以关闭本窗口，或按上箭头后回车重新执行。' -ForegroundColor Yellow
