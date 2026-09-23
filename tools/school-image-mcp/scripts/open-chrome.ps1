param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
)
$chrome = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chrome) {
  $command = Get-Command chrome.exe -ErrorAction SilentlyContinue
  if ($command) { $chrome = $command.Source }
}
if (-not $chrome) { throw 'Google Chrome was not found.' }
Start-Process -FilePath $chrome -ArgumentList @($Url)
