<#
.SYNOPSIS
    Inicia o Orquestrador Diário Autônomo TáPronto em Segundo Plano.
#>

$worktreeDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $worktreeDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logOut = Join-Path $logDir "autonomous-outreach.log"
$logErr = Join-Path $logDir "autonomous-error.log"

# Verificar se já existe processo rodando
$running = Get-CimInstance Win32_Process | Where-Object { 
    $_.ProcessId -ne $PID -and $_.Name -like "*node*" -and $_.CommandLine -like "*autonomous-daily-outreach.mjs*" 
}
if ($running) {
    Write-Host "Orquestrador já está rodando (PID: $($running.ProcessId))." -ForegroundColor Yellow
    exit 0
}

Write-Host "Iniciando Orquestrador Diário Autônomo TáPronto..." -ForegroundColor Cyan

$proc = Start-Process -FilePath "node.exe" -ArgumentList "scripts/autonomous-daily-outreach.mjs" -WorkingDirectory $worktreeDir -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 2

if ($proc -and -not $proc.HasExited) {
    Write-Host "✅ Orquestrador iniciado com sucesso! PID: $($proc.Id)" -ForegroundColor Green
    Write-Host "📄 Logs em: $logOut" -ForegroundColor White
} else {
    Write-Host "❌ O processo encerrou. Verifique $logErr" -ForegroundColor Red
}
