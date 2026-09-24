$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

npm run package

$version = node -p "require('./package.json').version"
$connectorVersion = node -p "require('./chrome-extension/manifest.json').version"
$vsix = "school-code-$version.vsix"
$zip = "school-code-connector-$connectorVersion.zip"
$checksums = 'SHA256SUMS.txt'

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path 'chrome-extension/*' -DestinationPath $zip -CompressionLevel Optimal

function Get-Sha256Line([string]$file) {
  $hash = (& certutil.exe -hashfile $file SHA256 | Where-Object { $_ -match '^[0-9A-Fa-f ]{64}$' } | Select-Object -First 1) -replace '\s', ''
  if (-not $hash) { throw "SHA-256 계산에 실패했습니다: $file" }
  return "$($hash.ToLowerInvariant())  $file"
}

$lines = @(
  (Get-Sha256Line $vsix)
  (Get-Sha256Line $zip)
)
Set-Content -LiteralPath $checksums -Value $lines -Encoding UTF8

Write-Host "Release files: $vsix, $zip, $checksums"
