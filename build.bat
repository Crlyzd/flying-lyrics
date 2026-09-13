@echo off
echo Packaging Flying Lyrics extension for Chrome Web Store...

:: Extract version from manifest.json, stage clean production files, and create a versioned zip
powershell.exe -NoProfile -Command ^
  "$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version;" ^
  "$zipName = '..\flying_lyrics_v' + $v + '.zip';" ^
  "$stage = Join-Path $env:TEMP ('fly_stage_' + [guid]::NewGuid().ToString('N'));" ^
  "New-Item -ItemType Directory -Path $stage | Out-Null;" ^
  "Copy-Item manifest.json -Destination $stage;" ^
  "Copy-Item -Recurse src -Destination $stage\src;" ^
  "Copy-Item -Recurse assets -Destination $stage\assets;" ^
  "if (Test-Path \"$stage\src\popup\js\popup-dev.js\") { Remove-Item \"$stage\src\popup\js\popup-dev.js\" -Force; }" ^
  "Compress-Archive -Path \"$stage\manifest.json\", \"$stage\src\", \"$stage\assets\" -DestinationPath $zipName -Force;" ^
  "Remove-Item -Recurse -Force $stage;" ^
  "Write-Host '';" ^
  "Write-Host ('Done! ' + $zipName + ' created securely (dev-tools physically stripped) and ready for the Chrome Web Store.') -ForegroundColor Green;"

pause

