@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'NowPlayingBridge.lnk')); $lnk.TargetPath = '%~dp0bridge.exe'; $lnk.WorkingDirectory = '%~dp0'; $lnk.Save()"
if errorlevel 1 (
  echo 添加失败，请右键以管理员身份运行。
) else (
  echo 已添加到开机启动。
  echo 位置: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NowPlayingBridge.lnk
)
pause
