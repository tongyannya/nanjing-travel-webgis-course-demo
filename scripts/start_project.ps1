param([switch]$NoBrowser, [switch]$Background)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$backendPython = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
$frontendModules = Join-Path $projectRoot 'frontend\node_modules'
$localToolsRoot = Join-Path $projectRoot '.tools'
$localCacheRoot = Join-Path $projectRoot '.local-cache'
$envPath = Join-Path $projectRoot '.env'
$backendScript = Join-Path $PSScriptRoot 'start_backend_window.ps1'
$frontendScript = Join-Path $PSScriptRoot 'start_frontend_window.ps1'
. (Join-Path $PSScriptRoot 'local_config.ps1')
$serviceConfig = Get-LocalServiceConfig -ProjectRoot $projectRoot
$siteUrl = $serviceConfig.SiteUrl
$healthUrl = $serviceConfig.HealthUrl

function Stop-WithMessage {
    param([string]$Message)
    Write-Host ''
    Write-Host $Message -ForegroundColor Red
    Write-Host '请按照根目录 README.md 的“第一次安装”处理后再双击启动。' -ForegroundColor Yellow
    exit 1
}

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Test-BackendReady {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return $response.status -eq 'ok' -and $response.service -eq 'nanjing-travel-webgis-backend'
    }
    catch {
        return $false
    }
}

function Test-FrontendReady {
    try {
        $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and
            $response.Content -match 'content="nanjing-travel-webgis"'
    }
    catch {
        return $false
    }
}

function Resolve-NpmPath {
    $systemNpm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($systemNpm) {
        return $systemNpm.Source
    }

    if (Test-Path -LiteralPath $localToolsRoot -PathType Container) {
        $localNpm = Get-ChildItem -LiteralPath $localToolsRoot -Directory -Filter 'node-*-win-x64' |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Join-Path $_.FullName 'npm.cmd' } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
        if ($localNpm) {
            return $localNpm
        }
    }

    return $null
}

if (-not (Test-Path -LiteralPath $backendPython -PathType Leaf)) {
    Stop-WithMessage '没有找到后端虚拟环境：backend\.venv。'
}
if (-not (Test-Path -LiteralPath $frontendModules -PathType Container)) {
    Stop-WithMessage '没有找到前端依赖：frontend\node_modules。'
}
$npmPath = Resolve-NpmPath
if (-not $npmPath) {
    Stop-WithMessage '没有找到 npm。请安装 Node.js，或将便携版 Node.js 放入项目根目录的 .tools 文件夹。'
}
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    Stop-WithMessage '没有找到本机配置文件 .env。'
}

$requiredKeys = 'VITE_AMAP_JS_KEY', 'AMAP_JS_SECURITY_CODE', 'AMAP_WEB_SERVICE_KEY'
$envLines = Get-Content -LiteralPath $envPath -Encoding UTF8
$missingKeys = foreach ($key in $requiredKeys) {
    $line = $envLines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($key) + '\s*=') } | Select-Object -First 1
    if (-not $line -or ($line -replace '^[^=]*=', '').Trim().Trim('"', "'").Trim().Length -eq 0) { $key }
}
if ($missingKeys) {
    Stop-WithMessage ('以下 .env 配置尚未填写：' + ($missingKeys -join '、'))
}

$backendListening = Test-PortListening $serviceConfig.BackendPort
$frontendListening = Test-PortListening $serviceConfig.FrontendPort
$backendReady = $backendListening -and (Test-BackendReady)
$frontendReady = $frontendListening -and (Test-FrontendReady)

$occupied = @()
if ($backendListening -and -not $backendReady) { $occupied += "$($serviceConfig.BackendPort)（后端）" }
if ($frontendListening -and -not $frontendReady) { $occupied += "$($serviceConfig.FrontendPort)（前端）" }
if ($occupied) {
    Stop-WithMessage ('端口已被其他程序占用：' + ($occupied -join '、') + '。请先关闭占用程序。')
}
if ($backendReady -and $frontendReady) {
    Write-Host '项目已经在运行，直接打开网页。' -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $siteUrl }
    exit 0
}

$powerShell = (Get-Command 'powershell.exe').Source
$commonArguments = '-NoExit -NoProfile -ExecutionPolicy Bypass -File'
$serviceOptions = @{}
if ($Background) {
    $commonArguments = '-NoProfile -ExecutionPolicy Bypass -File'
    $serviceOptions.WindowStyle = 'Hidden'
}
$null = New-Item -ItemType Directory -Force -Path $localCacheRoot
$env:NPM_CONFIG_CACHE = Join-Path $localCacheRoot 'npm'
$env:TEMP = Join-Path $localCacheRoot 'tmp'
$env:TMP = $env:TEMP
$null = New-Item -ItemType Directory -Force -Path $env:NPM_CONFIG_CACHE, $env:TEMP
if ($backendReady) {
    Write-Host '检测到本项目后端已经运行，将继续复用。' -ForegroundColor Green
}
else {
    Start-Process -FilePath $powerShell -WorkingDirectory $projectRoot -ArgumentList "$commonArguments `"$backendScript`" -ProjectRoot `"$projectRoot`"" @serviceOptions
}
if ($frontendReady) {
    Write-Host '检测到本项目前端已经运行，将继续复用。' -ForegroundColor Green
}
else {
    Start-Process -FilePath $powerShell -WorkingDirectory $projectRoot -ArgumentList "$commonArguments `"$frontendScript`" -ProjectRoot `"$projectRoot`" -NpmPath `"$npmPath`"" @serviceOptions
}

Write-Host '正在等待前后端服务就绪……' -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    if (-not $backendReady) { $backendReady = Test-BackendReady }
    if (-not $frontendReady) { $frontendReady = Test-FrontendReady }
    if ($backendReady -and $frontendReady) { break }
    Start-Sleep -Milliseconds 500
}

if ($backendReady -and $frontendReady) {
    Write-Host "启动成功：$siteUrl" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $siteUrl }
    exit 0
}

Write-Host ''
Write-Host '服务没有在 45 秒内全部就绪。请查看“南京旅行规划 - 后端”和“南京旅行规划 - 前端”窗口中的报错。' -ForegroundColor Red
exit 1
