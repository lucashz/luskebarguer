$worktreeDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $worktreeDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Ensure-Process {
    param(
        [string]$Name,
        [string]$MatchPattern,
        [string]$Executable,
        [string]$Arguments,
        [string]$WorkingDir,
        [string]$LogPrefix
    )

    $proc = Get-CimInstance Win32_Process | Where-Object { 
        $_.ProcessId -ne $PID -and $_.Name -like "*$Executable*" -and $_.CommandLine -like "*$MatchPattern*" 
    }
    if (-not $proc) {
        $outLog = Join-Path $logDir "$LogPrefix.log"
        $errLog = Join-Path $logDir "$LogPrefix.err.log"
        Write-Host "[STARTING] $Name..."

        $p = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
        Start-Sleep -Milliseconds 800
        if ($p -and -not $p.HasExited) {
            Write-Host "  OK: $Name iniciado (PID: $($p.Id))"
        } else {
            Write-Host "  FAIL: Falha ao iniciar $Name"
        }
    } else {
        Write-Host "  RUNNING: $Name (PID: $($proc.ProcessId))"
    }
}

Write-Host "Verificando servicos em segundo plano do TaPronto..."

Ensure-Process -Name "SSH Tunnel (PostgreSQL 5433)" `
    -MatchPattern "5433:localhost:5432" `
    -Executable "ssh.exe" `
    -Arguments "-o ServerAliveInterval=30 -o ServerAliveCountMax=5 -N -L 5433:localhost:5432 lucas@130.51.23.180" `
    -WorkingDir $worktreeDir `
    -LogPrefix "ssh-tunnel-5433"

Ensure-Process -Name "Windows HTTP Proxy (Port 8888)" `
    -MatchPattern "windows-http-proxy.mjs" `
    -Executable "node.exe" `
    -Arguments "scripts/windows-http-proxy.mjs" `
    -WorkingDir $worktreeDir `
    -LogPrefix "proxy-http-8888"

Ensure-Process -Name "SOCKS5 Proxy (Port 10800)" `
    -MatchPattern "socks5-proxy.mjs" `
    -Executable "node.exe" `
    -Arguments "scripts/socks5-proxy.mjs" `
    -WorkingDir $worktreeDir `
    -LogPrefix "proxy-socks5-10800"

Ensure-Process -Name "Autonomous Daily Outreach Daemon" `
    -MatchPattern "autonomous-daily-outreach.mjs" `
    -Executable "node.exe" `
    -Arguments "scripts/autonomous-daily-outreach.mjs" `
    -WorkingDir $worktreeDir `
    -LogPrefix "autonomous-outreach"

Write-Host "Todos os servicos foram verificados com sucesso."
