param(
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [string]$RelayBaseUrl = "http://127.0.0.1:3000/api/crs/v1",
  [string]$Model = "gpt-5.5",
  [string]$EnvKey = "MUSE_CRS_API_KEY",
  [string]$EnabledSources = "oauth"
)

$ErrorActionPreference = "Stop"

function New-CrsKey {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return "cr_" + ([System.BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant())
}

function Set-TopLevelTomlKey {
  param(
    [string]$Content,
    [string]$Key,
    [string]$Value
  )

  $line = "$Key = $Value"
  if ($Content -match "(?m)^$([regex]::Escape($Key))\s*=") {
    return [regex]::Replace($Content, "(?m)^$([regex]::Escape($Key))\s*=.*$", $line, 1)
  }
  return "$line`r`n$Content"
}

function Get-ObjectValue {
  param(
    [object]$Object,
    [string]$Name,
    [object]$Default = ""
  )

  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $Default }
  return $property.Value
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$crsConfigPath = Join-Path $repoRoot "server\data\crs-relay.json"
$codexConfigPath = Join-Path $CodexHome "config.toml"

New-Item -ItemType Directory -Force -Path (Split-Path $crsConfigPath -Parent) | Out-Null
New-Item -ItemType Directory -Force -Path $CodexHome | Out-Null

$crs = [pscustomobject]@{}
if (Test-Path $crsConfigPath) {
  try {
    $crs = (Get-Content -LiteralPath $crsConfigPath -Raw | ConvertFrom-Json)
  } catch {
    $crs = [pscustomobject]@{}
  }
}

$publicKey = [string](Get-ObjectValue $crs "publicApiKey" "")
if (-not $publicKey.Trim()) {
  $publicKey = New-CrsKey
}

$crsOut = [ordered]@{
  enabled = $true
  name = [string](Get-ObjectValue $crs "name" "Muse CRS")
  upstreamBaseUrl = [string](Get-ObjectValue $crs "upstreamBaseUrl" "https://api.openai.com/v1")
  upstreamApiKey = [string](Get-ObjectValue $crs "upstreamApiKey" "")
  publicApiKey = $publicKey
  defaultModel = $Model
  timeoutMs = [int](Get-ObjectValue $crs "timeoutMs" 120000)
  enabledSources = @($EnabledSources -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  lastTestAt = [string](Get-ObjectValue $crs "lastTestAt" "")
  lastTestStatus = [string](Get-ObjectValue $crs "lastTestStatus" "never")
  lastError = [string](Get-ObjectValue $crs "lastError" "")
}

($crsOut | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $crsConfigPath -Encoding UTF8

if (Test-Path $codexConfigPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = "$codexConfigPath.bak-muse-crs-$stamp"
  Copy-Item -LiteralPath $codexConfigPath -Destination $backupPath -Force
  $content = Get-Content -LiteralPath $codexConfigPath -Raw
} else {
  $backupPath = ""
  $content = ""
}

$content = Set-TopLevelTomlKey $content "model_provider" '"muse_crs"'
$content = Set-TopLevelTomlKey $content "model" ('"' + $Model + '"')
$content = Set-TopLevelTomlKey $content "preferred_auth_method" '"apikey"'

$providerBlock = @"

[model_providers.muse_crs]
name = "Muse CRS"
base_url = "$RelayBaseUrl"
env_key = "$EnvKey"
wire_api = "responses"

"@

$content = [regex]::Replace($content, "(?ms)^\[model_providers\.muse_crs\]\r?\n.*?(?=^\[|\z)", "")
$content = $content.TrimEnd() + "`r`n" + $providerBlock
Set-Content -LiteralPath $codexConfigPath -Value $content -Encoding UTF8

[Environment]::SetEnvironmentVariable($EnvKey, $publicKey, "User")
[Environment]::SetEnvironmentVariable("CRS_ENABLED_SOURCES", $EnabledSources, "User")
Set-Item -Path "Env:$EnvKey" -Value $publicKey
Set-Item -Path "Env:CRS_ENABLED_SOURCES" -Value $EnabledSources

[pscustomobject]@{
  codexConfig = $codexConfigPath
  backup = $backupPath
  crsConfig = $crsConfigPath
  relayBaseUrl = $RelayBaseUrl
  envKey = $EnvKey
  apiKey = $publicKey
} | ConvertTo-Json -Depth 4
