param(
  [Parameter(Mandatory = $true)][string]$Sender,
  [Parameter(Mandatory = $true)][string]$Recipient,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$checkoutDirectory = Split-Path -Parent $PSScriptRoot
$resolvedEvidence = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
if ((Get-Item -LiteralPath $resolvedEvidence).PSIsContainer -ne $true) {
  throw 'EvidenceDirectory must be an existing directory.'
}
if (Get-NetTCPConnection -LocalPort 3217 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 3217 already has a listener. Check the existing proof session instead of starting another.'
}
if ($Sender -notmatch '^G[A-Z2-7]{55}$' -or $Recipient -notmatch '^G[A-Z2-7]{55}$' -or $Sender -eq $Recipient) {
  throw 'Provide distinct public Stellar G-addresses.'
}
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
# Start-Process launches a separate hidden Windows process. No keys are passed;
# the existing Node spike generates its disposable sponsor only in memory.
$processArguments = @(
  '--import', 'tsx',
  'scripts/spike-freighter-bootstrap.ts',
  $Sender, $Recipient,
  ('"' + $resolvedEvidence + '"')
)
$serverProcess = Start-Process -FilePath $nodeExecutable -WorkingDirectory $checkoutDirectory `
  -ArgumentList $processArguments -WindowStyle Hidden -PassThru
$launchRecord = [ordered]@{
  startedAtUTC = [DateTime]::UtcNow.ToString('o')
  processId = $serverProcess.Id
  url = 'http://127.0.0.1:3217'
  checkout = $checkoutDirectory
  keyStorage = 'Disposable sponsor key in Node process memory only'
}
$recordName = 'freighter-server-launch-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json'
$launchRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resolvedEvidence $recordName) -Encoding UTF8
$launchRecord | ConvertTo-Json
