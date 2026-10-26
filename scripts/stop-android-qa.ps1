param([string]$AvdName = 'kleym-qa-api36')
$ErrorActionPreference = 'Stop'
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$adbPath = Join-Path $sdkRoot 'platform-tools/adb.exe'
if (!(Test-Path -LiteralPath $adbPath)) { throw 'Android Studio SDK platform-tools were not found.' }
$devices = & $adbPath devices
foreach ($line in $devices) {
    # Emulator-console identity/shutdown work even while Android's ADB trust
    # dialog is pending. Never target physical-device serials or guess a name.
    if ($line -match '^(emulator-\d+)\s+(device|unauthorized)\s*$') {
        $serial = $Matches[1]
        $identity = & $adbPath -s $serial emu avd name
        if ($LASTEXITCODE -ne 0 -or !$identity) { continue }
        $name = ($identity | Select-Object -First 1).Trim()
        if ($name -eq $AvdName) {
            & $adbPath -s $serial emu kill
            if ($LASTEXITCODE -ne 0) { throw "Could not stop $AvdName." }
            Write-Output "Stopped $AvdName; its data is retained."
            return
        }
    }
}
Write-Output "No running emulator with verified name $AvdName was found. No other device was stopped."
