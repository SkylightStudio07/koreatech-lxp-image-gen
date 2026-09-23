$ErrorActionPreference = 'Stop'
$bookmarkletPath = Join-Path $PSScriptRoot '.local/connect-bookmarklet.txt'
if (-not (Test-Path -LiteralPath $bookmarkletPath)) { throw 'Start the bridge first with start-bridge.ps1.' }
Set-Clipboard -Value (Get-Content -LiteralPath $bookmarkletPath -Raw)
Write-Host 'Connection bookmarklet copied. Open the logged-in school chat, type javascript: in the address bar, then paste the code without duplicating that prefix.'
