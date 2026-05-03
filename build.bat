@echo off
echo Packaging Flying Lyrics extension...

:: Extract version from manifest.json and create a versioned zip
powershell.exe -NoProfile -Command "$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version; $zipName = 'flying_lyrics_v' + $v + '.zip'; Compress-Archive -Path manifest.json, src, assets -DestinationPath $zipName -Force; Write-Host ''; Write-Host ('Done! ' + $zipName + ' has been created securely and is ready for the Chrome Web Store.')"

pause
