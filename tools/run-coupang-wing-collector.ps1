$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $env:LOCALAPPDATA 'JangsAI'
$logPath = Join-Path $logDirectory 'coupang-wing-collector.log'

New-Item -ItemType Directory -Force $logDirectory | Out-Null
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 수집 시작" |
    Out-File -FilePath $logPath -Append -Encoding utf8

Push-Location $projectRoot
try {
    & node (Join-Path $PSScriptRoot 'collect-coupang-wing.mjs') 2>&1 |
        Tee-Object -FilePath $logPath -Append
    $collectorExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 수집 종료 (코드: $collectorExitCode)" |
    Out-File -FilePath $logPath -Append -Encoding utf8
exit $collectorExitCode
