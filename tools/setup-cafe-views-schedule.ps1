$ErrorActionPreference = 'Stop'
$taskName = 'JangsAI Cafe Views Collector'
$runnerPath = Join-Path $PSScriptRoot 'run-cafe-views-collector.ps1'

if (-not (Test-Path $runnerPath)) {
    throw "카페 조회수 실행 파일을 찾지 못했습니다: $runnerPath"
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At '09:45'
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Google Sheets의 최근 92일 네이버 카페 글 조회수를 목록 단위로 수집해 JangsAI에 기록합니다.' `
    -Force | Out-Null

Write-Output "$taskName 예약 작업을 매일 09:45에 등록했습니다."
