@echo off
echo Packaging Flying Lyrics extension...

:: Create a zip containing only the necessary files
powershell.exe -NoProfile -Command "Compress-Archive -Path manifest.json, src, assets -DestinationPath release.zip -Force"

echo.
echo Done! 
echo 'release.zip' has been created securely and is ready for the Chrome Web Store.
pause
