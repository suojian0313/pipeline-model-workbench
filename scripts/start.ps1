param([switch]$SeedDemo)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $projectRoot
try {
    uv sync --project backend-python --locked --python 3.12
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency setup failed' }
    if (!(Test-Path -LiteralPath 'data/model.json') -or !(Test-Path -LiteralPath 'data/welds.jsonl')) {
        uv run --project backend-python python scripts/prepare_data.py
        if ($LASTEXITCODE -ne 0) { throw 'Attachment preparation failed' }
    }
    docker compose -f compose.yaml -f compose.app.yaml up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Application startup failed. Check docker compose logs.' }
    if ($SeedDemo) {
        docker compose -f compose.yaml -f compose.app.yaml exec -T node node dist/cli.js seed-demo
        if ($LASTEXITCODE -ne 0) { throw 'Demo date seed failed' }
    }
    $appConfig = docker compose -f compose.yaml -f compose.app.yaml config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read application port' }
    $webPort = $appConfig.services.web.ports[0].published
    Write-Host "Model workbench: http://localhost:$webPort"
    Write-Host "Other LAN computers: http://<this-computer-IP>:$webPort"
} finally { Pop-Location }
