function Get-LocalServiceConfig {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $values = @{
        FRONTEND_HOST = '127.0.0.1'
        FRONTEND_PORT = '5173'
        BACKEND_HOST = '127.0.0.1'
        BACKEND_PORT = '8000'
    }
    $envPath = Join-Path $ProjectRoot '.env'
    if (Test-Path -LiteralPath $envPath -PathType Leaf) {
        foreach ($line in (Get-Content -LiteralPath $envPath -Encoding UTF8)) {
            if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $values.ContainsKey($Matches[1])) {
                $name = $Matches[1]
                $value = $Matches[2].Trim().Trim('"', "'")
                if ($value) { $values[$name] = $value }
            }
        }
    }
    foreach ($name in @($values.Keys)) {
        $processValue = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($processValue) { $values[$name] = $processValue }
    }
    [pscustomobject]@{
        FrontendHost = $values.FRONTEND_HOST
        FrontendPort = [int]$values.FRONTEND_PORT
        BackendHost = $values.BACKEND_HOST
        BackendPort = [int]$values.BACKEND_PORT
        SiteUrl = "http://$($values.FRONTEND_HOST):$($values.FRONTEND_PORT)/"
        HealthUrl = "http://$($values.BACKEND_HOST):$($values.BACKEND_PORT)/api/health"
    }
}
