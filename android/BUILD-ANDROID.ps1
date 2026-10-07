$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:JAVA_HOME = (Get-ChildItem '.build-tools/java' -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $PSScriptRoot '.build-tools/sdk'
$env:GRADLE_USER_HOME = Join-Path $PSScriptRoot '.build-tools/gradle-cache'
if (-not (Test-Path -LiteralPath "$env:JAVA_HOME/bin/java.exe")) { throw 'Install JDK 17 and Android SDK or open this project in Android Studio.' }
& .\gradlew.bat --no-daemon :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
if ($LASTEXITCODE -ne 0) { throw 'Android build or checks failed.' }
Write-Host "APK: $PSScriptRoot\app\build\outputs\apk\debug\app-debug.apk"
