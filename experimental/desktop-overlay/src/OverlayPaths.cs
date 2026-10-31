using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32;
public static class OverlayPaths
{
    public static string Profile {
        get {
            using(RegistryKey key=Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\"+WindowsIdentity.GetCurrent().User.Value))
                if(key!=null && key.GetValue("ProfileImagePath")!=null) return Environment.ExpandEnvironmentVariables(Convert.ToString(key.GetValue("ProfileImagePath")));
            return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        }
    }
    public static readonly string Home=Path.Combine(Profile,@"Documents\MikuDesktopOverlay");
    public static readonly string Bridge=Path.Combine(Profile,@"Documents\MikuWallpaper\bridge");
    public static readonly string ApiFile=Path.Combine(Bridge,"ai.ini");
    public static void StartHidden(string exe) {
        Process.Start(new ProcessStartInfo(exe){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=Path.GetDirectoryName(exe)});
    }
    public static void StartBridge() {
        if(!File.Exists(Path.Combine(Bridge,"bridge.exe")))throw new Exception("请先运行安装.bat。");
        StartHidden(Path.Combine(Bridge,"bridge.exe"));StartHidden(Path.Combine(Bridge,"watchdog.exe"));
    }
    public static void OpenSettings() {
        Process.Start(new ProcessStartInfo(Path.Combine(Bridge,"AiSettings.exe")){WorkingDirectory=Bridge});
    }
    public static void Shortcut(string folder,string name,string target,string args) {
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        dynamic link=shell.CreateShortcut(Path.Combine(folder,name+".lnk"));link.TargetPath=target;link.Arguments=args;link.WorkingDirectory=Path.GetDirectoryName(target);link.Save();
        Marshal.FinalReleaseComObject(link);Marshal.FinalReleaseComObject(shell);
    }
    static void CopyTree(string source,string target) {
        Directory.CreateDirectory(target);
        foreach(string file in Directory.GetFiles(source))File.Copy(file,Path.Combine(target,Path.GetFileName(file)),true);
        foreach(string dir in Directory.GetDirectories(source))CopyTree(dir,Path.Combine(target,Path.GetFileName(dir)));
    }
    public static void Install(string source) {
        if(!File.Exists(Path.Combine(source,@"player\index.html")))throw new Exception("请完整解压后再安装。");
        foreach(Process p in Process.GetProcessesByName("MikuDeskLayer")) {
            try{if(p.Id!=Process.GetCurrentProcess().Id && String.Equals(Path.GetDirectoryName(p.MainModule.FileName),Home,StringComparison.OrdinalIgnoreCase))throw new Exception("请先从托盘退出 Miku 桌面歌词，再更新。");}
            finally{p.Dispose();}
        }
        string oldWindow=Path.Combine(Profile,@"Documents\MikuFloatingPlayer\MikuFloating.exe");
        foreach(Process p in Process.GetProcessesByName("MikuFloating")){
            try{if(String.Equals(p.MainModule.FileName,oldWindow,StringComparison.OrdinalIgnoreCase)){p.Kill();p.WaitForExit(3000);}}
            finally{p.Dispose();}
        }
        string[] roots={Bridge,Path.Combine(Profile,@"AppData\Local\MikuWallpaper\bridge"),Path.Combine(Profile,@"AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\MikuWallpaper\bridge")};
        foreach(string name in new[]{"watchdog","bridge"})foreach(Process p in Process.GetProcessesByName(name)){
            try{string dir=Path.GetDirectoryName(p.MainModule.FileName);foreach(string root in roots)if(String.Equals(dir,root,StringComparison.OrdinalIgnoreCase)){p.Kill();p.WaitForExit(4000);break;}}
            finally{p.Dispose();}
        }
        Directory.CreateDirectory(Home);Directory.CreateDirectory(Bridge);
        foreach(string name in new[]{"MikuDeskLayer.exe","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.Wpf.dll","WebView2Loader.dll"})File.Copy(Path.Combine(source,name),Path.Combine(Home,name),true);
        CopyTree(Path.Combine(source,"player"),Path.Combine(Home,"player"));
        string prior=File.Exists(ApiFile)?File.ReadAllText(ApiFile):"";
        AiConfig protectedConfig=AiConfig.Load(ApiFile);
        foreach(string name in new[]{"bridge.exe","watchdog.exe","AiSettings.exe"})File.Copy(Path.Combine(source,"bridge",name),Path.Combine(Bridge,name),true);
        if(!File.Exists(Path.Combine(Bridge,"hotkeys.ini")))File.Copy(Path.Combine(source,@"bridge\hotkeys.ini"),Path.Combine(Bridge,"hotkeys.ini"));
        if(prior.Contains("keyProtected="))File.WriteAllText(ApiFile,"enabled="+(protectedConfig.Enabled?"1":"0")+"\r\nbase="+protectedConfig.Base+"\r\nmodel="+protectedConfig.Model+"\r\nkey="+protectedConfig.Key+"\r\n");
        else if(prior.Length==0)File.WriteAllText(ApiFile,"enabled=0\r\nbase=\r\nmodel=\r\nkey=\r\n");
        Shortcut(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Miku 桌面歌词",Path.Combine(Home,"MikuDeskLayer.exe"),"");
        Shortcut(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Miku 桌面歌词",Path.Combine(Home,"MikuDeskLayer.exe"),"");
        Shortcut(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"MikuWallpaperBridge",Path.Combine(Bridge,"watchdog.exe"),"");
        // Remove only shortcuts from the superseded ordinary-window implementation.
        foreach(string folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs),Environment.GetFolderPath(Environment.SpecialFolder.Startup)}){
            string name=folder==Environment.GetFolderPath(Environment.SpecialFolder.Startup)?"MikuFloatingPlayer.lnk":"Miku 悬浮播放器.lnk";
            string shortcut=Path.Combine(folder,name);
            if(File.Exists(shortcut)){
                dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(shortcut);
                string target=Convert.ToString(link.TargetPath);Marshal.FinalReleaseComObject(link);Marshal.FinalReleaseComObject(shell);
                if(String.Equals(target,oldWindow,StringComparison.OrdinalIgnoreCase))File.Delete(shortcut);
            }
        }
        StartBridge();
    }
}
