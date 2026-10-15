param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [Parameter(Mandatory = $true)]
    [string]$NpmPath
)

Set-Location -LiteralPath $ProjectRoot
. (Join-Path $PSScriptRoot 'local_config.ps1')
$serviceConfig = Get-LocalServiceConfig -ProjectRoot $ProjectRoot
$Host.UI.RawUI.WindowTitle = '南京旅行规划 - 前端'
Write-Host "正在启动前端：$($serviceConfig.SiteUrl)" -ForegroundColor Cyan
Write-Host '停止服务：在本窗口按 Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

& $NpmPath --prefix frontend run dev

Write-Host ''
Write-Host '前端已经停止。可以关闭本窗口，或按上箭头后回车重新执行。' -ForegroundColor Yellow
