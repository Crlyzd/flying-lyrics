@echo off
setlocal
echo ====================================================
echo  Flying Lyrics Packaging & Dev Utility
echo ====================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
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
    set /p choice="Select option (1-6) [default: 1]: "
    if "%choice%"=="2" (
        node tools\build.js --target=chrome
    ) else if "%choice%"=="3" (
        node tools\build.js --target=firefox
    ) else if "%choice%"=="4" (
        node tools\target.js chrome
    ) else if "%choice%"=="5" (
        node tools\target.js firefox
    ) else if "%choice%"=="6" (
        node tools\target.js status
    ) else (
        node tools\build.js --target=all
    )
) else (
    echo Node.js not detected in PATH. Falling back to PowerShell Chrome packager...
    powershell.exe -NoProfile -Command ^
      "$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version;" ^
      "$zipName = 'dist\flying_lyrics_chrome_v' + $v + '.zip';" ^
      "$dist = 'dist';" ^
      "if (!(Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null; }" ^
      "$stage = Join-Path $env:TEMP ('fly_stage_' + [guid]::NewGuid().ToString('N'));" ^
      "New-Item -ItemType Directory -Path $stage | Out-Null;" ^
      "Copy-Item manifest.json -Destination $stage;" ^
      "Copy-Item -Recurse src -Destination $stage\src;" ^
      "Copy-Item -Recurse assets -Destination $stage\assets;" ^
      "if (Test-Path \"$stage\src\popup\js\popup-dev.js\") { Remove-Item \"$stage\src\popup\js\popup-dev.js\" -Force; }" ^
      "if (Test-Path \"$stage\src\popup\css\controls-dev.css\") { Remove-Item \"$stage\src\popup\css\controls-dev.css\" -Force; }" ^
      "Compress-Archive -Path \"$stage\*\" -DestinationPath $zipName -Force;" ^
      "Remove-Item -Recurse -Force $stage;" ^
      "Write-Host '';" ^
      "Write-Host ('Done! ' + $zipName + ' created securely (dev-tools physically stripped).') -ForegroundColor Green;"
)

echo.
pause
