param([switch]$LocalDevelopment)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:ANDROID_USER_HOME = Join-Path $PSScriptRoot '.build-tools/android-user'
New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME | Out-Null
$adb = Join-Path $PSScriptRoot '.build-tools/sdk/platform-tools/adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'Android platform-tools are missing.' }
& $adb devices
& $adb get-state
if ($LASTEXITCODE -ne 0) { throw 'Connect one Android phone by USB, enable USB debugging, and approve its prompt.' }
& $adb install -r (Join-Path $PSScriptRoot 'app/build/outputs/apk/debug/app-debug.apk')
if ($LASTEXITCODE -ne 0) { throw 'Install failed. An older build signed with another key must be handled manually; this script never uninstalls or deletes app data.' }
if ($LocalDevelopment) {
    & $adb reverse tcp:5500 tcp:5500
    if ($LASTEXITCODE -ne 0) { throw 'Could not forward the PC server to the phone.' }
}
& $adb shell am start -n com.example.mbknowledgehub/.MainActivity
if ($LocalDevelopment) {
    Write-Host 'Local testing: keep the PC server running and explicitly set http://127.0.0.1:5500 in the app.'
} else {
    Write-Host 'Use https://mb-smart-link-ai.onrender.com in the app. After installation, internet is enough; USB and the PC server are not needed.'
}
Write-Host 'Sign in, lock a category, then ENABLE MB.'
