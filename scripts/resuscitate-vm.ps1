<#
.SYNOPSIS
    Script de Ressuscitação e Watchdog da VM VirtualBox "Cardápio" e Disparo das Marmitarias.
.DESCRIPTION
    Verifica o estado da VM no VirtualBox, reinicia caso esteja travada/congelada,
    aguarda a Evolution API ficar online (state: open) e dispara o lote de marmitarias.
#>

param(
    [switch]$ForceReset = $false,
    [switch]$Dispatch = $false
)

$VBoxManage = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
$VmName = "b8a64fe3-ccca-4c00-812e-ace872147ca8" # Cardápio VM UUID
$VmIp = "192.168.1.108"
$EvoUrl = "http://${VmIp}:8080"
$ApiKey = "b99ee681a32aafc2cc8376608494974676fd7d19363a60a0d4f6c7a650e9f062"
$Instance = "tapronto"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   WATCHDOG & RESSUSCITAÇÃO DA VM VIRTUALBOX: $VmName           " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $VBoxManage)) {
    Write-Host "[ERRO] VBoxManage.exe não encontrado em $VBoxManage" -ForegroundColor Red
    exit 1
}

# 1. Verificar estado da VM
Write-Host "[1/5] Verificando estado da VM no VirtualBox..." -ForegroundColor Yellow
$vmInfo = & $VBoxManage showvminfo $VmName --machinereadable 2>$null
$vmState = ($vmInfo | Select-String '^VMState="(.+)"' | ForEach-Object { $_.Matches.Groups[1].Value })

Write-Host "Estado atual da VM: '$vmState'" -ForegroundColor White

if ($ForceReset -or ($vmState -ne "running")) {
    if ($vmState -eq "running") {
        Write-Host "Forçando Reset da VM travada..." -ForegroundColor Red
        & $VBoxManage controlvm $VmName reset
    } else {
        Write-Host "Iniciando VM em modo Headless..." -ForegroundColor Green
        & $VBoxManage startvm $VmName --type headless
    }
    Write-Host "Aguardando 20 segundos para o boot do Linux..." -ForegroundColor Yellow
    Start-Sleep -Seconds 20
}

# 2. Testar conectividade de Rede (Ping)
Write-Host "[2/5] Testando resposta de rede ($VmIp)..." -ForegroundColor Yellow
$pingOk = $false
for ($i = 1; $i -le 10; $i++) {
    if (Test-Connection -ComputerName $VmIp -Count 1 -Quiet) {
        $pingOk = $true
        break
    }
    Write-Host "Tentativa ${i}: Aguardando rede da VM... (${i}/10)" -ForegroundColor Gray
    Start-Sleep -Seconds 3
}

if (-not $pingOk) {
    Write-Host "[AVISO] VM não respondeu ao ping. Forçando ciclo de Poweroff + Start..." -ForegroundColor Red
    & $VBoxManage controlvm $VmName poweroff
    Start-Sleep -Seconds 5
    & $VBoxManage startvm $VmName --type headless
    Start-Sleep -Seconds 25
}

# 3. Testar Evolution API
Write-Host "[3/5] Verificando Evolution API ($EvoUrl)..." -ForegroundColor Yellow
$evoOk = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "$EvoUrl/instance/connectionState/$Instance" -Headers @{ apikey = $ApiKey } -TimeoutSec 5 -ErrorAction Stop
        if ($res.state -eq "open" -or $res.instance.state -eq "open") {
            $evoOk = $true
            Write-Host "✅ Evolution API Online e WhatsApp Conectado (state: open)!" -ForegroundColor Green
            break
        } else {
            Write-Host "Evolution API respondendo, estado da instância: $($res.state)... aguardando conectar." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Tentativa ${i}: Evolution API ainda carregando... (${i}/15)" -ForegroundColor Gray
    }
    Start-Sleep -Seconds 4
}

# Se ainda não conectou, tentar reiniciar contêiner da Evolution API via SSH
if (-not $evoOk) {
    Write-Host "[AVISO] Reiniciando contêiner evolution_api via SSH..." -ForegroundColor Yellow
    ssh -o ConnectTimeout=5 root@${VmIp} "docker restart evolution_api" 2>$null
    Start-Sleep -Seconds 15
}

# 4. Garantir serviços de Túnel SSH e Proxies Ativos
Write-Host "[4/6] Garantindo Túnel SSH (5433) e Proxies (8888, 10800) ativos..." -ForegroundColor Yellow
$hiddenServicesScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "start-hidden-services.ps1"
if (Test-Path $hiddenServicesScript) {
    & powershell.exe -ExecutionPolicy Bypass -File $hiddenServicesScript
}

# 5. Status da Fila de Disparos
Write-Host "[5/6] Verificando fila de disparos para hoje..." -ForegroundColor Yellow
cd "d:\lsk\TáProntomenu.com.br\.worktrees\release-production-outreach-20261014"
if (Test-Path "scripts/check-tomorrow-leads-status.mjs") {
    node scripts/check-tomorrow-leads-status.mjs
}

# 6. Executar disparo se solicitado
if ($Dispatch) {
    Write-Host "[6/6] Disparando lote de marmitarias agora..." -ForegroundColor Green
    node scripts/dispatch-monday-marmitarias.mjs --retry-failed
} else {
    Write-Host ""
    Write-Host "Para forçar o disparo manual a qualquer momento, execute:" -ForegroundColor Cyan
    Write-Host "  node scripts/dispatch-monday-marmitarias.mjs --retry-failed" -ForegroundColor White
    Write-Host "Ou execute este script com o parâmetro -Dispatch:" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/resuscitate-vm.ps1 -Dispatch" -ForegroundColor White
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "           RESSUSCITAÇÃO / WATCHDOG CONCLUÍDO COM SUCESSO!      " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

