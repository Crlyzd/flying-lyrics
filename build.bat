@echo off
setlocal
echo ====================================================
echo  Flying Lyrics Packaging ^& Dev Utility
echo ====================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 goto :no_node

:menu
echo --- Production Packaging ---
echo [1] Build All (Chrome + Firefox zips)
echo [2] Build Chrome Web Store package only
echo [3] Build Firefox AMO package only
echo.
echo --- Local Dev Manifest Switcher ---
echo [4] Switch unpacked dev manifest to Chromium (Edge / Chrome)
echo [5] Switch unpacked dev manifest to Gecko (Firefox)
echo [6] Check active unpacked dev manifest target
echo.
echo --- Version Management ^& Auditing ---
echo [7] Bump extension version across all targets
echo [8] Validate Cross-Browser Parity ^& Compatibility
echo.
set "choice=1"
set /p choice="Select option (1-8) [default: 1]: "
set "choice=%choice: =%"

if "%choice%"=="1" goto :build_all
if "%choice%"=="2" goto :build_chrome
if "%choice%"=="3" goto :build_firefox
if "%choice%"=="4" goto :switch_chrome
if "%choice%"=="5" goto :switch_firefox
if "%choice%"=="6" goto :check_target
if "%choice%"=="7" goto :bump_version
if "%choice%"=="8" goto :validate

echo.
echo [!] Invalid selection "%choice%". Please select a number from 1 to 8.
echo.
goto :menu

:build_all
node tools\build.js --target=all
goto :end

:build_chrome
node tools\build.js --target=chrome
goto :end

:build_firefox
node tools\build.js --target=firefox
goto :end

:switch_chrome
node tools\target.js chrome
goto :end

:switch_firefox
node tools\target.js firefox
goto :end

:check_target
node tools\target.js status
goto :end

:bump_version
echo.
set "CURVER="
for /f "tokens=*" %%v in ('node -e "try { console.log(require('./manifest.json').version); } catch(e) { console.log('unknown'); }"') do set "CURVER=%%v"
echo Current version: v%CURVER%
echo.
echo Select bump type:
echo [1] Patch  (e.g. v%CURVER% -^> patch) [Default]
echo [2] Minor  (e.g. v%CURVER% -^> minor)
echo [3] Major  (e.g. v%CURVER% -^> major)
echo [4] Custom version string
echo.
set "bchoice=1"
set /p bchoice="Select bump type (1-4) [default: 1]: "
set "bchoice=%bchoice: =%"

if "%bchoice%"=="2" (
    node tools\bump-version.js minor
    goto :end
)
if "%bchoice%"=="3" (
    node tools\bump-version.js major
    goto :end
)
if "%bchoice%"=="4" goto :bump_custom
node tools\bump-version.js patch
goto :end

:bump_custom
set "customver="
set /p customver="Enter custom version (e.g. 5.3.0): "
set "customver=%customver: =%"
if not defined customver (
    echo Version cannot be empty.
    goto :end
)
node tools\bump-version.js %customver%
goto :end

:validate
node tools\validate.js
goto :end

:no_node
echo Node.js not detected in PATH. Falling back to PowerShell Chrome packager...
powershell.exe -NoProfile -Command ^
  "$m = if (Test-Path manifest.chrome.json) { 'manifest.chrome.json' } else { 'manifest.json' };" ^
  "$v = (Get-Content $m -Raw | ConvertFrom-Json).version;" ^
  "$zipName = 'dist\flying_lyrics_chrome_v' + $v + '.zip';" ^
  "$dist = 'dist';" ^
  "if (!(Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null; }" ^
  "$stage = Join-Path $env:TEMP ('fly_stage_' + [guid]::NewGuid().ToString('N'));" ^
  "New-Item -ItemType Directory -Path $stage | Out-Null;" ^
  "Copy-Item $m -Destination (Join-Path $stage 'manifest.json');" ^
  "Copy-Item -Recurse src -Destination $stage\src;" ^
  "Copy-Item -Recurse assets -Destination $stage\assets;" ^
  "if (Test-Path \"$stage\src\popup\js\popup-dev.js\") { Remove-Item \"$stage\src\popup\js\popup-dev.js\" -Force; }" ^
  "if (Test-Path \"$stage\src\popup\css\controls-dev.css\") { Remove-Item \"$stage\src\popup\css\controls-dev.css\" -Force; }" ^
  "Compress-Archive -Path \"$stage\*\" -DestinationPath $zipName -Force;" ^
  "Remove-Item -Recurse -Force $stage;" ^
  "Write-Host '';" ^
  "Write-Host ('Done! ' + $zipName + ' created securely (dev-tools physically stripped).') -ForegroundColor Green;"
goto :end

:end
echo.
pause
