$ErrorActionPreference = 'Continue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $env:LOCALAPPDATA 'JangsAI'
$logPath = Join-Path $logDirectory 'cafe-views-collector.log'
$mutex = New-Object System.Threading.Mutex($false, 'Local\JangsAICafeViewsCollector')

New-Item -ItemType Directory -Force $logDirectory | Out-Null
function Write-Utf8Log {
    param([string]$Message)
    [IO.File]::AppendAllText($logPath, $Message + [Environment]::NewLine, $utf8)
}

if (-not $mutex.WaitOne(0)) {
    Write-Utf8Log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Skipped duplicate run; collector is already running."
    $mutex.Dispose()
    exit 0
}

Write-Utf8Log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Cafe view collection started."

$collectorExitCode = 1
$previousLogPath = $env:JANGSAI_CAFE_VIEWS_LOG_PATH
$env:JANGSAI_CAFE_VIEWS_LOG_PATH = $logPath
Push-Location $projectRoot
try {
    & node (Join-Path $PSScriptRoot 'collect-cafe-views.mjs')
    $collectorExitCode = $LASTEXITCODE
} finally {
    Pop-Location
    if ($null -eq $previousLogPath) {
        Remove-Item Env:JANGSAI_CAFE_VIEWS_LOG_PATH -ErrorAction SilentlyContinue
    } else {
        $env:JANGSAI_CAFE_VIEWS_LOG_PATH = $previousLogPath
    }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}

Write-Utf8Log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Cafe view collection finished (exit code: $collectorExitCode)."
exit $collectorExitCode
