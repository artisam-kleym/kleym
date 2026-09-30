param(
  [Parameter(Mandatory = $true)][string]$Sender,
  [Parameter(Mandatory = $true)][string]$Recipient,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory,
  [ValidateSet('absent', 'existing-no-trustline', 'existing-trustline')][string]$RecipientMode = 'absent'
)
$ErrorActionPreference = 'Stop'
$checkoutDirectory = Split-Path -Parent $PSScriptRoot
$resolvedEvidence = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
if ((Get-Item -LiteralPath $resolvedEvidence).PSIsContainer -ne $true) { throw 'Use an existing evidence directory.' }
if (Get-NetTCPConnection -LocalPort 3218 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3218 already has a proof listener; resolve that session first.' }
if ($Sender -notmatch '^G[A-Z2-7]{55}$' -or $Recipient -notmatch '^G[A-Z2-7]{55}$' -or $Sender -eq $Recipient) { throw 'Provide distinct public Stellar G-addresses.' }
$processArguments = @('--import', 'tsx', 'scripts/spike-freighter-lifecycle.ts', $Sender, $Recipient, ('"' + $resolvedEvidence + '"'), $RecipientMode)
$serverProcess = Start-Process -FilePath (Get-Command node.exe).Source -WorkingDirectory $checkoutDirectory -ArgumentList $processArguments -WindowStyle Hidden -PassThru
$launch = [ordered]@{ startedAtUTC = [DateTime]::UtcNow.ToString('o'); processId = $serverProcess.Id; url = 'http://127.0.0.1:3218'; checkout = $checkoutDirectory; recipientMode = $RecipientMode; keyStorage = 'Sponsor in process memory; link keys in browser/local CSV only' }
$name = 'freighter-lifecycle-launch-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json'
$launch | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resolvedEvidence $name) -Encoding UTF8
$launch | ConvertTo-Json
