param(
  [string]$Action = "start"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Action -eq "stop") {
  Get-NetTCPConnection -LocalPort 5433,8888,10800 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Write-Output "Services stopped."
  return
}

# 1. Stop existing on ports if any
Get-NetTCPConnection -LocalPort 5433,8888,10800 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500

# 2. Start SSH Tunnel (port 5433)
$sshCmd = "ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=5 -N -L 5433:localhost:5432 lucas@130.51.23.180"
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = $sshCmd} | Out-Null

# 3. Start Windows HTTP Proxy (port 8888)
$httpProxyScript = Join-Path $scriptDir "windows-http-proxy.mjs"
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = "node `"$httpProxyScript`""} | Out-Null

# 4. Start Reverse SSH Proxy Tunnel to VM (bridges Windows port 8888 directly into VM port 8888)
$vmProxyCmd = "ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o BatchMode=yes -N -R 0.0.0.0:8888:127.0.0.1:8888 root@192.168.1.108"
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = $vmProxyCmd} | Out-Null

# 5. Start SOCKS5 Proxy (port 10800)
$socksProxyScript = Join-Path $scriptDir "socks5-proxy.mjs"
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = "node `"$socksProxyScript`""} | Out-Null

Start-Sleep -Seconds 2

$conns = Get-NetTCPConnection -LocalPort 5433,8888,10800 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State
Write-Output "Hidden background services running:"
$conns | Format-Table -AutoSize
