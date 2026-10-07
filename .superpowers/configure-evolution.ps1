$tempPath = Join-Path $env:TEMP 'tapronto-evolution-access.txt'
$envPath = Join-Path (Get-Location) '.env'
$lines = [System.Collections.Generic.List[string]]::new()
if (Test-Path $envPath) { foreach ($line in Get-Content $envPath) { $lines.Add($line) } }
$access = if (Test-Path $tempPath) { Get-Content $tempPath } else { @() }
$baseUrl = (($access | Where-Object { $_ -like 'Evolution API:*' } | Select-Object -First 1) -replace '^Evolution API:\s*','').Trim()
$apiKey = (($access | Where-Object { $_ -like 'API key:*' } | Select-Object -First 1) -replace '^API key:\s*','').Trim()
if (-not $baseUrl) { $baseUrl = ((($lines | Where-Object { $_ -match '^SALES_EVOLUTION_V2_BASE_URL=' } | Select-Object -First 1) -split '=',2)[1]).Trim() }
if (-not $apiKey) { $apiKey = ((($lines | Where-Object { $_ -match '^SALES_EVOLUTION_V2_API_KEY=' } | Select-Object -First 1) -split '=',2)[1]).Trim() }
if (-not $baseUrl -or -not $apiKey) { throw 'Credenciais Evolution não encontradas.' }
function Set-EnvLine([string]$key,[string]$value) {
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ('^' + [regex]::Escape($key) + '=')) { $lines[$i] = "$key=$value"; return }
  }
  $lines.Add("$key=$value")
}
$public = ''
foreach ($key in @('PUBLIC_APP_URL','APP_URL')) {
  $match = $lines | Where-Object { $_ -match ('^' + $key + '=') } | Select-Object -First 1
  if ($match) {
    $candidate = (($match -split '=',2)[1]).Trim().Trim('"').Trim("'")
    if ($candidate -match '^https://') { $public = $candidate.TrimEnd('/'); break }
  }
}
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$hookSecret = ([System.BitConverter]::ToString($bytes) -replace '-','').ToLowerInvariant()
Set-EnvLine 'SALES_EVOLUTION_V2_BASE_URL' $baseUrl
Set-EnvLine 'SALES_EVOLUTION_V2_API_KEY' $apiKey
Set-EnvLine 'SALES_EVOLUTION_V2_INSTANCE' ('t' + [char]0x00E1 + 'pronto')
Set-EnvLine 'SALES_EVOLUTION_V2_WEBHOOK_SECRET' $hookSecret
Set-EnvLine 'SALES_AUTOMATION_ENABLED' 'false'
Set-EnvLine 'SALES_AUTOMATION_MODE' 'draft'
Set-EnvLine 'SALES_DAILY_LIMIT' '10'
Set-EnvLine 'SALES_INSTANCE_DAILY_LIMIT' '10'
if ($public) { Set-EnvLine 'SALES_EVOLUTION_V2_WEBHOOK_URL' ($public + '/api/integrations/evolution/webhook') }
[System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
if (Test-Path $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
Write-Output 'configured=true'
Write-Output "public_webhook=$([bool]$public)"
Write-Output 'sending_enabled=false'
