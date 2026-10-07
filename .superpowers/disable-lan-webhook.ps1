$ErrorActionPreference = 'Stop'
$values = @{}
foreach ($line in Get-Content .env) { if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'") } }
$headers = @{ apikey = $values['SALES_EVOLUTION_V2_API_KEY']; 'Content-Type' = 'application/json' }
$instance = [uri]::EscapeDataString(('t' + [char]0x00E1 + 'pronto'))
$payload = @{ webhook = @{ enabled = $false; url = 'http://192.168.1.107:3640/api/integrations/evolution/webhook'; webhookByEvents = $false; webhookBase64 = $false; events = @('MESSAGES_UPSERT','CONNECTION_UPDATE'); headers = @{} } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri ($values['SALES_EVOLUTION_V2_BASE_URL'].TrimEnd('/') + '/webhook/set/' + $instance) -Method Post -Headers $headers -Body $payload | Out-Null
Write-Output 'webhook_enabled=false'
