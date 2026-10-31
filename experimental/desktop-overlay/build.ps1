param([string]$AuthorReleasePath)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath
$sdkVersion='1.0.3537.50'
$deps=Join-Path $PSScriptRoot '.deps'
$sdk=Join-Path $deps "WebView2-$sdkVersion"
$dist=Join-Path $PSScriptRoot 'dist'
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if(-not (Test-Path -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Wpf.dll'))){
    New-Item -ItemType Directory -Path $deps -Force | Out-Null
    $archive=Join-Path $deps "WebView2-$sdkVersion.zip"
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $archive -UseBasicParsing
    Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force
}
New-Item -ItemType Directory -Path $dist,(Join-Path $dist 'bridge'),(Join-Path $dist 'player\assets') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'),(Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Wpf.dll'),(Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt'),(Join-Path $sdk 'NOTICE.txt') -Destination $dist -Force
$author=if($AuthorReleasePath){(Resolve-Path -LiteralPath $AuthorReleasePath).ProviderPath}else{$repo}
foreach($name in @('bridge.exe','AiSettings.exe','hotkeys.ini')){
    Copy-Item -LiteralPath (Join-Path $author "bridge\$name") -Destination (Join-Path $dist 'bridge') -Force
}
$watchdog=Join-Path $author 'bridge\watchdog.exe'
if(Test-Path -LiteralPath $watchdog){Copy-Item -LiteralPath $watchdog -Destination (Join-Path $dist 'bridge\watchdog.exe') -Force}
else{
    & "$framework\csc.exe" /nologo /target:winexe "/out:$dist\bridge\watchdog.exe" (Join-Path $repo 'watchdog.cs')
    if($LASTEXITCODE -ne 0){throw 'Watchdog compilation failed.'}
}
Set-Content -LiteralPath (Join-Path $dist 'bridge\ai.ini') -Value (@('enabled=0','base=','key=','model=') -join [Environment]::NewLine) -Encoding UTF8
Copy-Item -Path (Join-Path $PSScriptRoot 'player\*') -Destination (Join-Path $dist 'player') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'wallpaper\assets\fonts') -Destination (Join-Path $dist 'player\assets') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'wallpaper\assets\demo-cover.png') -Destination (Join-Path $dist 'player\assets\demo-cover.png') -Force
Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.bat' | Copy-Item -Destination $dist -Force
$argsList=@('/nologo','/platform:x64','/target:winexe','/main:DesktopOverlay',"/out:$dist\MikuDeskLayer.exe",'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Security.dll','/reference:System.Web.Extensions.dll','/reference:Microsoft.CSharp.dll',"/reference:$framework\WPF\PresentationCore.dll","/reference:$framework\WPF\PresentationFramework.dll","/reference:$framework\WPF\WindowsBase.dll",'/reference:System.Xaml.dll',"/reference:$dist\Microsoft.Web.WebView2.Core.dll","/reference:$dist\Microsoft.Web.WebView2.Wpf.dll")
$sources=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Filter '*.cs' | Select-Object -ExpandProperty FullName
& "$framework\csc.exe" @argsList @sources
if($LASTEXITCODE -ne 0){throw 'Overlay compilation failed.'}
Write-Host "Experimental build complete: $dist"
Write-Host 'Desktop input bug remains under investigation. Build did not install or launch the overlay.'
