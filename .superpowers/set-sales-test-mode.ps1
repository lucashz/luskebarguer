param([ValidateSet('on','off')][string]$Mode)
$path = Join-Path (Get-Location) '.env'
$lines = [System.Collections.Generic.List[string]](Get-Content $path)
function Set-Value([string]$key,[string]$value) {
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ('^' + [regex]::Escape($key) + '=')) { $lines[$i] = "$key=$value"; return }
  }
  $lines.Add("$key=$value")
}
Set-Value 'SALES_EVOLUTION_V2_INSTANCE' ('t' + [char]0x00E1 + 'pronto')
if ($Mode -eq 'on') {
  Set-Value 'SALES_AUTOMATION_ENABLED' 'true'
  Set-Value 'SALES_AUTOMATION_MODE' 'autonomous'
  Set-Value 'SALES_ALLOWED_START_TIME' '00:00'
  Set-Value 'SALES_ALLOWED_END_TIME' '23:59'
  Set-Value 'SALES_MIN_INTERVAL_SECONDS' '30'
} else {
  Set-Value 'SALES_AUTOMATION_ENABLED' 'false'
  Set-Value 'SALES_AUTOMATION_MODE' 'draft'
  Set-Value 'SALES_ALLOWED_START_TIME' '09:00'
  Set-Value 'SALES_ALLOWED_END_TIME' '18:00'
  Set-Value 'SALES_MIN_INTERVAL_SECONDS' '180'
}
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "test_mode=$Mode"
