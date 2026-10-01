param(
    [Parameter(Mandatory=$true, HelpMessage="Введите ваш Vercel API Token (создайте на https://vercel.com/account/tokens)")]
    [string]$Token,
    [string]$ProjectName = "urok-robototehniki"
)

$ErrorActionPreference = "Stop"
Write-Host "🚀 Подготовка файлов проекта '$ProjectName' к публикации на Vercel..." -ForegroundColor Cyan

$root = $PSScriptRoot
$filesToDeploy = @(
    "index.html",
    "styles.css",
    "vercel.json",
    "package.json",
    "README.md",
    "js/svg-models.js",
    "js/projects.js",
    "js/circuit-engine.js",
    "js/arduino-interpreter.js",
    "js/app.js"
)

$vercelFiles = @()
foreach ($relPath in $filesToDeploy) {
    $fullPath = Join-Path $root $relPath
    if (Test-Path $fullPath) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $base64 = [System.Convert]::ToBase64String($bytes)
        $vercelFiles += @{
            file = $relPath
            data = $base64
            encoding = "base64"
        }
    }
}

$payload = @{
    name = $ProjectName
    files = $vercelFiles
    projectSettings = @{
        framework = $null
        buildCommand = $null
        outputDirectory = $null
    }
    target = "production"
} | ConvertTo-Json -Depth 6

$headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
}

Write-Host "📡 Отправка сборки в облако Vercel..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments" -Method Post -Headers $headers -Body $payload

$prodUrl = "https://$($response.url)"
if ($response.alias -and $response.alias.Count -gt 0) {
    $prodUrl = "https://$($response.alias[0])"
}

Write-Host "`n✅ Деплой успешно завершён!" -ForegroundColor Green
Write-Host "🌍 Публичная ссылка на продакшен: $prodUrl" -ForegroundColor Green
Write-Host "🔗 Ссылка на билд: https://$($response.url)" -ForegroundColor Cyan
