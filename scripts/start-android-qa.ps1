param([string]$AvdName = 'kleym-qa-api36')
$ErrorActionPreference = 'Stop'
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$emulatorPath = Join-Path $sdkRoot 'emulator/emulator.exe'
if (!(Test-Path -LiteralPath $emulatorPath)) { throw 'Android Studio SDK emulator was not found.' }
$available = & $emulatorPath -list-avds
if ($available -notcontains $AvdName) { throw "AVD '$AvdName' is missing. See docs/android-qa.md." }
# The emulator is an interactive tool the operator explicitly opens. Do not
# create a terminal helper or launch an unrelated Android Studio project.
Start-Process -FilePath $emulatorPath -ArgumentList @('-avd', $AvdName, '-no-snapshot', '-no-boot-anim', '-no-audio') -WindowStyle Normal
Write-Output "Started $AvdName. Keep test wallets separate from real funds."
