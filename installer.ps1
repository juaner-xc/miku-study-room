$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host '=== Miku Study Room 音乐壁纸 安装 ===' -ForegroundColor Cyan

# 1. 找 Wallpaper Engine
$we = $null
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
if ($steam) {
    $p = Join-Path $steam 'steamapps\common\wallpaper_engine'
    if (Test-Path $p) { $we = $p }
}
if (-not $we) {
    foreach ($p in @(
        'D:\Steam\steamapps\common\wallpaper_engine',
        'C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine',
        'E:\Steam\steamapps\common\wallpaper_engine'
    )) {
        if (Test-Path $p) { $we = $p; break }
    }
}
if (-not $we) {
    Write-Host '没有找到 Wallpaper Engine。' -ForegroundColor Red
    Write-Host '请确认已安装并至少运行过一次，或手动把 wallpaper 文件夹拖进 WE 的“创建壁纸 → 网页”。'
    Read-Host '按回车退出'
    exit 1
}
Write-Host "Wallpaper Engine: $we"

# 2. 复制壁纸工程
$dest = Join-Path $we 'projects\myprojects\Miku Study Room'
Write-Host '正在复制壁纸工程...'
robocopy (Join-Path $root 'wallpaper') $dest /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null

# 3. 把控制桥装到固定位置，避免用户删掉压缩包后失效
$data = Join-Path $env:LOCALAPPDATA 'MikuWallpaper'
$bridgeDir = Join-Path $data 'bridge'
New-Item -ItemType Directory -Force $bridgeDir | Out-Null

# 先停掉正在运行的 bridge，否则 exe 被占用无法覆盖
Get-Process bridge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

Copy-Item (Join-Path $root 'bridge\*') $bridgeDir -Recurse -Force

# 4. 启动控制桥
Start-Process (Join-Path $bridgeDir 'bridge.exe') -WindowStyle Hidden
if (Test-Path (Join-Path $bridgeDir 'watchdog.exe')) { Start-Process (Join-Path $bridgeDir 'watchdog.exe') -WindowStyle Hidden }
Start-Sleep -Milliseconds 1200

# 5. 应用壁纸
$wp = Join-Path $dest 'index.html'
& (Join-Path $we 'wallpaper32.exe') -control openWallpaper -file $wp
Start-Sleep -Milliseconds 1500

# 6. 开机自启（默认安装，否则重启后壁纸会读不到网易云）
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'MikuWallpaperBridge.lnk'))
$lnk.TargetPath = Join-Path $bridgeDir 'bridge.exe'
$lnk.WorkingDirectory = $bridgeDir

$lnkWD = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'MikuWallpaperWatchdog.lnk'))
$lnkWD.TargetPath = Join-Path $bridgeDir 'watchdog.exe'
$lnkWD.WorkingDirectory = $bridgeDir
$lnkWD.WindowStyle = 7
$lnkWD.Save()
$lnk.Save()
Write-Host '已添加开机自启。' -ForegroundColor Green

# 7. 桌面 + 开始菜单快捷方式：AI 设置
$ws2 = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $lnkPath = Join-Path $dir 'Miku 壁纸 AI 设置.lnk'
    $lnk2 = $ws2.CreateShortcut($lnkPath)
    $lnk2.TargetPath = Join-Path $bridgeDir 'AiSettings.exe'
    $lnk2.WorkingDirectory = $bridgeDir
    $lnk2.Save()
}
Write-Host '已创建“Miku 壁纸 AI 设置”快捷方式。' -ForegroundColor Green

Write-Host ''
Write-Host '安装完成。' -ForegroundColor Green
Write-Host '壁纸已应用到主显示器；如果没看到，在 WE 的“已安装”里选择 “Miku Study Room”。'
Write-Host "控制桥位置：$bridgeDir"
Write-Host '如果网易云的快捷键不是 Ctrl+Alt+P / Left / Right，请修改 bridge\hotkeys.ini 后重启 bridge.exe。'
Read-Host '按回车退出'
