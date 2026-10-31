$ErrorActionPreference='Stop'
$dist=Join-Path $PSScriptRoot 'dist'
if(-not (Test-Path -LiteralPath (Join-Path $dist 'MikuDeskLayer.exe'))){throw 'Run build.ps1 first.'}
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$webview=Join-Path $PSScriptRoot '.deps\WebView2-1.0.3537.50\lib\net462\Microsoft.Web.WebView2.WinForms.dll'
Copy-Item -LiteralPath $webview -Destination $dist -Force
foreach($name in @('OverlayPolicyTests','NativeGuardTests','RecordModeTests')){
    & "$framework\csc.exe" /nologo /platform:x64 "/out:$dist\$name.exe" "/reference:$dist\MikuDeskLayer.exe" "/reference:$dist\Microsoft.Web.WebView2.Core.dll" "/reference:$dist\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Xaml.dll "/reference:$framework\WPF\WindowsBase.dll" "/reference:$framework\WPF\PresentationFramework.dll" "/reference:$framework\WPF\PresentationCore.dll" (Join-Path $PSScriptRoot "tests\$name.cs")
    if($LASTEXITCODE -ne 0){throw "$name compilation failed."}
    & (Join-Path $dist "$name.exe")
    if($LASTEXITCODE -ne 0){throw "$name failed."}
}
Write-Host 'Isolation tests passed. Real desktop wallpaper switching is still unverified.'
