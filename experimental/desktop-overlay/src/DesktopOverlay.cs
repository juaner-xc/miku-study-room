using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms=System.Windows.Forms;

public sealed class DesktopOverlay : Window
{
    const int GWL_EXSTYLE=-20, WS_EX_TRANSPARENT=0x20, WS_EX_TOOLWINDOW=0x80, WS_EX_NOACTIVATE=0x08000000;
    const uint SWP_NOSIZE=1,SWP_NOMOVE=2,SWP_NOACTIVATE=0x10;
    const int WM_SHOWLAYER=0x8000+311;
    WebView2CompositionControl view=new WebView2CompositionControl();
    Forms.NotifyIcon tray=new Forms.NotifyIcon();
    DispatcherTimer orderTimer=new DispatcherTimer();
    List<InputProxy> proxies=new List<InputProxy>();
    List<Rect> regions=new List<Rect>();
    double pageWidth=1,pageHeight=1;
    IntPtr handle;bool ready;volatile bool closing,shutdownComplete;
    long guardHeartbeat=Stopwatch.GetTimestamp();
    JavaScriptSerializer json=new JavaScriptSerializer();
    string root=AppDomain.CurrentDomain.BaseDirectory;
    CoreWebView2Environment webEnvironment;
    DispatcherTimer guardTimer=new DispatcherTimer();
    bool safetyStopping;

    public DesktopOverlay()
    {
        Title="Miku 桌面歌词";
        WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.NoResize;
        AllowsTransparency=true;Background=Brushes.Transparent;
        ShowInTaskbar=false;ShowActivated=false;Topmost=false;
        FitScreen();
        view.DefaultBackgroundColor=System.Drawing.Color.Transparent;
        Content=view;
        SourceInitialized+=delegate {
            handle=new WindowInteropHelper(this).Handle;
            SetWindowLong(handle,GWL_EXSTYLE,GetWindowLong(handle,GWL_EXSTYLE)|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE|WS_EX_TRANSPARENT);
            HwndSource.FromHwnd(handle).AddHook(WindowMessage);
            PlaceAtDesktop();
        };
        Loaded+=async delegate {await Initialize();};
        Forms.ContextMenuStrip menu=new Forms.ContextMenuStrip();
        menu.Items.Add("显示 / 隐藏歌词播放器",null,delegate {Dispatcher.Invoke(new Action(Toggle));});
        menu.Items.Add("原版设置（歌词特效 / 字体）",null,delegate {Dispatcher.Invoke(new Action(async delegate {if(!IsVisible)Show();if(ready)await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('settingsBtn').click()");}));});
        menu.Items.Add("设置 API / 网易云快捷键",null,delegate {try{OverlayPaths.OpenSettings();}catch(Exception ex){Forms.MessageBox.Show(ex.Message,"设置未能打开");}});
        Forms.ToolStripMenuItem startup=new Forms.ToolStripMenuItem("开机显示歌词播放器");
        startup.Checked=File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"MikuDesktopOverlay.lnk"));
        startup.CheckOnClick=true;
        startup.CheckedChanged+=delegate {
            try {
                string folder=Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                if(startup.Checked)OverlayPaths.Shortcut(folder,"MikuDesktopOverlay",Path.Combine(OverlayPaths.Home,"MikuDeskLayer.exe"),"");
                else {string file=Path.Combine(folder,"MikuDesktopOverlay.lnk");if(File.Exists(file))File.Delete(file);}
            }catch(Exception ex){Forms.MessageBox.Show(ex.Message,"开机启动设置失败");}
        };
        menu.Items.Add(startup);menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("退出桌面歌词",null,delegate {Dispatcher.Invoke(new Action(Close));});
        tray.Icon=System.Drawing.SystemIcons.Application;tray.Text="Miku 桌面歌词";tray.ContextMenuStrip=menu;tray.Visible=true;
        tray.DoubleClick+=delegate{Dispatcher.Invoke(new Action(Toggle));};
        orderTimer.Interval=TimeSpan.FromMilliseconds(900);orderTimer.Tick+=delegate{if(IsVisible)PlaceAtDesktop();};orderTimer.Start();
        guardTimer.Interval=TimeSpan.FromMilliseconds(150);guardTimer.Tick+=delegate{GuardNativeInput();};guardTimer.Start();
        Thread emergency=new Thread(delegate(){
            while(!shutdownComplete){
                if(NativeInputGuard.EmergencyExitPressed())Environment.Exit(0);
                double silent=(Stopwatch.GetTimestamp()-Interlocked.Read(ref guardHeartbeat))/(double)Stopwatch.Frequency;
                if(silent>(closing?3:8))Environment.Exit(2);
                Thread.Sleep(75);
            }
        });emergency.IsBackground=true;emergency.Start();
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged+=DisplayChanged;
        Closed+=delegate{
            closing=true;orderTimer.Stop();guardTimer.Stop();
            Interlocked.Exchange(ref guardHeartbeat,Stopwatch.GetTimestamp());
            foreach(InputProxy proxy in proxies)proxy.Dispose();
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged-=DisplayChanged;
            tray.Visible=false;tray.Dispose();view.Dispose();
            shutdownComplete=true;
        };
    }
    void GuardNativeInput()
    {
        if(handle==IntPtr.Zero||closing||safetyStopping)return;
        Interlocked.Exchange(ref guardHeartbeat,Stopwatch.GetTimestamp());
        try{
            var pids=new List<int>{Process.GetCurrentProcess().Id};
            if(webEnvironment!=null)pids.AddRange(webEnvironment.GetProcessInfos().Select(p=>(int)p.ProcessId));
            int changes;
            bool safe=NativeInputGuard.Enforce(handle,pids.ToArray(),proxies.Where(p=>p.IsHandleCreated).Select(p=>p.Handle).ToArray(),(int)(Width*VisualTreeHelper.GetDpi(this).DpiScaleX),(int)(Height*VisualTreeHelper.GetDpi(this).DpiScaleY),out changes);
            if(!safe){
                safetyStopping=true;Hide();foreach(InputProxy proxy in proxies)proxy.Hide();
                Directory.CreateDirectory(OverlayPaths.Home);
                File.WriteAllText(Path.Combine(OverlayPaths.Home,"safety-stop.txt"),"An unverified native fullscreen input surface was detected. Overlay stopped to preserve desktop input.");
                Close();
            }
        }catch{
            // Losing the ability to audit native input is itself a reason to stop the overlay.
            safetyStopping=true;Close();
        }
    }
    void DisplayChanged(object sender,EventArgs e){Dispatcher.BeginInvoke(new Action(FitScreen));}
    void FitScreen(){Rect work=SystemParameters.WorkArea;Left=work.Left;Top=work.Top;Width=work.Width;Height=work.Height;}
    void Toggle(){if(IsVisible){Hide();foreach(InputProxy proxy in proxies)proxy.Hide();}else{Show();SyncInputProxies();PlaceAtDesktop();}}
    IntPtr WindowMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam,ref bool handled)
    {
        if(message==0x21){handled=true;return new IntPtr(3);} // MA_NOACTIVATE
        if(message==0x84){handled=true;return new IntPtr(-1);} // Never hit-test the fullscreen visual layer.
        if(message==WM_SHOWLAYER){if(!IsVisible)Show();PlaceAtDesktop();handled=true;}
        return IntPtr.Zero;
    }
    void PlaceAtDesktop()
    {
        if(handle==IntPtr.Zero)return;
        IntPtr previous=IntPtr.Zero,after=IntPtr.Zero;bool found=false;
        EnumWindows(delegate(IntPtr window,IntPtr state){
            if(window==handle || proxies.Any(p=>p.IsHandleCreated&&p.Handle==window))return true;
            if(FindWindowEx(window,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){
                after=previous;found=true;return false;
            }
            if(IsWindowVisible(window))previous=window;
            return true;
        },IntPtr.Zero);
        if(found){
            SetWindowPos(handle,after,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
            foreach(InputProxy proxy in proxies)if(proxy.Visible)SetWindowPos(proxy.Handle,after,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
        }
        // Keep desktop content below ordinary application windows and above the wallpaper.
    }
    void SyncInputProxies()
    {
        if(handle==IntPtr.Zero || closing)return;
        // Fail closed: the fullscreen render surface NEVER receives mouse input.
        int style=GetWindowLong(handle,GWL_EXSTYLE);
        if((style&WS_EX_TRANSPARENT)==0)SetWindowLong(handle,GWL_EXSTYLE,style|WS_EX_TRANSPARENT);
        List<Rect> safe=SafeInputRegions(regions,pageWidth,pageHeight).ToList();
        while(proxies.Count<safe.Count)proxies.Add(new InputProxy(this));
        for(int i=0;i<proxies.Count;i++){
            InputProxy proxy=proxies[i];
            if(!IsVisible || i>=safe.Count){proxy.Hide();continue;}
            Rect r=safe[i];
            Point a=view.PointToScreen(new Point(r.Left*view.ActualWidth/pageWidth,r.Top*view.ActualHeight/pageHeight));
            Point b=view.PointToScreen(new Point(r.Right*view.ActualWidth/pageWidth,r.Bottom*view.ActualHeight/pageHeight));
            proxy.Bounds=new System.Drawing.Rectangle((int)Math.Floor(a.X),(int)Math.Floor(a.Y),Math.Max(1,(int)Math.Ceiling(b.X-a.X)),Math.Max(1,(int)Math.Ceiling(b.Y-a.Y)));
            if(!proxy.Visible)proxy.Show();
        }
        PlaceAtDesktop();
    }
    public static Rect[] SafeInputRegions(IEnumerable<Rect> source,double width,double height)
    {
        if(width<=0 || height<=0 || Double.IsNaN(width) || Double.IsNaN(height) || Double.IsInfinity(width) || Double.IsInfinity(height))return new Rect[0];
        Rect viewport=new Rect(0,0,width,height);
        return source.Where(r=>!r.IsEmpty && !Double.IsNaN(r.X+r.Y+r.Width+r.Height) && !Double.IsInfinity(r.X+r.Y+r.Width+r.Height))
            .Select(r=>Rect.Intersect(r,viewport))
            .Where(r=>!r.IsEmpty && r.Width<width*.85 && r.Height<height*.82 && r.Width>=8 && r.Height>=8)
            .Take(8).ToArray();
    }
    async void ForwardMouse(string type,System.Drawing.Point screen,string button,int clicks,int delta)
    {
        if(!ready||closing)return;
        try{
            Point local=view.PointFromScreen(new Point(screen.X,screen.Y));
            var input=new Dictionary<string,object>{{"type",type},{"x",local.X*pageWidth/Math.Max(1,view.ActualWidth)},{"y",local.Y*pageHeight/Math.Max(1,view.ActualHeight)}};
            if(type=="mouseWheel"){input["deltaX"]=0;input["deltaY"]=delta;}
            else {input["button"]=button;input["clickCount"]=clicks;}
            await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",json.Serialize(input));
        }catch{}
    }
    async Task Initialize()
    {
        try {
            OverlayPaths.StartBridge();Directory.CreateDirectory(OverlayPaths.Home);
            CoreWebView2Environment environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(OverlayPaths.Home,"WebViewCache"));
            webEnvironment=environment;
            await view.EnsureCoreWebView2Async(environment);
            GuardNativeInput();if(safetyStopping||closing)return;
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
            view.CoreWebView2.Settings.IsStatusBarEnabled=false;
            view.CoreWebView2.Settings.AreDevToolsEnabled=false;
            view.CoreWebView2.SetVirtualHostNameToFolderMapping("miku-overlay.local",Path.Combine(root,"player"),CoreWebView2HostResourceAccessKind.DenyCors);
            view.CoreWebView2.WebMessageReceived+=delegate(object sender,CoreWebView2WebMessageReceivedEventArgs e){
                Uri uri;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out uri)||uri.Host!="miku-overlay.local")return;
                try {
                    RegionMessage data=json.Deserialize<RegionMessage>(e.TryGetWebMessageAsString());
                    if(data.kind!="regions"||data.width<=0||data.height<=0)return;
                    pageWidth=data.width;pageHeight=data.height;
                    regions=(data.rects??new RegionBox[0]).Where(r=>r.w>0&&r.h>0).Select(r=>new Rect(r.x,r.y,r.w,r.h)).ToList();
                    SyncInputProxies();
                }catch{}
            };
            view.CoreWebView2.AddWebResourceRequestedFilter("http://127.0.0.1:*/hideicons*",CoreWebView2WebResourceContext.All);
            view.CoreWebView2.AddWebResourceRequestedFilter("http://127.0.0.1:*/showicons*",CoreWebView2WebResourceContext.All);
            view.CoreWebView2.AddWebResourceRequestedFilter("https://miku-overlay.local/assets/bg/*",CoreWebView2WebResourceContext.All);
            view.CoreWebView2.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){
                if(e.Request.Uri.StartsWith("https://miku-overlay.local/assets/bg/"))e.Response=environment.CreateWebResourceResponse(Stream.Null,204,"No Content","");
                else {
                    byte[] gif=Convert.FromBase64String("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
                    e.Response=environment.CreateWebResourceResponse(new MemoryStream(gif),200,"OK","Content-Type: image/gif");
                }
            };
            view.CoreWebView2.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
            view.CoreWebView2.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.Host!="miku-overlay.local")e.Cancel=true;};
            view.CoreWebView2.NavigationCompleted+=async delegate{
                ready=true;PlaceAtDesktop();
                // A machine-readable report, without capturing or examining the user's desktop.
                if(Environment.GetCommandLineArgs().Contains("--diagnostics")){
                    await Task.Delay(1800);
                    if(closing)return;
                    string page=await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,backgroundHidden:getComputedStyle(document.querySelector('.bg')).display==='none',capsule:!!document.querySelector('#player'),themes:document.querySelectorAll('#modeChips button').length})");
                    File.WriteAllText(Path.Combine(OverlayPaths.Home,"diagnostics.json"),json.Serialize(new{allowsTransparency=AllowsTransparency,windowStyle=WindowStyle.ToString(),showInTaskbar=ShowInTaskbar,backgroundAlpha=view.DefaultBackgroundColor.A,fullscreenAlwaysClickThrough=(GetWindowLong(handle,GWL_EXSTYLE)&WS_EX_TRANSPARENT)!=0,inputProxyCount=proxies.Count,interactiveRegions=regions.Count,page=page}));
                }
            };
            view.Source=new Uri("https://miku-overlay.local/index.html");
        }catch(Exception ex){
            Directory.CreateDirectory(OverlayPaths.Home);File.WriteAllText(Path.Combine(OverlayPaths.Home,"startup-error.txt"),ex.Message);
            Forms.MessageBox.Show("桌面歌词未能启动："+ex.Message,"Miku 桌面歌词");Close();
        }
    }
    public class RegionMessage{public string kind;public double width,height;public RegionBox[] rects;}
    public class RegionBox{public double x,y,w,h;}
    // Input is isolated into small windows covering only the visible controls.
    // A malformed or oversized DOM rectangle can never turn the desktop into a mouse blocker.
    sealed class InputProxy:Forms.Form
    {
        DesktopOverlay owner;DateTime lastMove=DateTime.MinValue;
        public InputProxy(DesktopOverlay owner){
            this.owner=owner;FormBorderStyle=Forms.FormBorderStyle.None;ShowInTaskbar=false;AutoScaleMode=Forms.AutoScaleMode.None;
            BackColor=System.Drawing.Color.Black;Opacity=1.0/255;Text="Miku 控件交互层";StartPosition=Forms.FormStartPosition.Manual;
            MouseMove+=delegate(object sender,Forms.MouseEventArgs e){if((DateTime.UtcNow-lastMove).TotalMilliseconds<25)return;lastMove=DateTime.UtcNow;owner.ForwardMouse("mouseMoved",PointToScreen(e.Location),Capture?"left":"none",0,0);};
            MouseDown+=delegate(object sender,Forms.MouseEventArgs e){if(e.Button!=Forms.MouseButtons.Left)return;Capture=true;owner.ForwardMouse("mousePressed",PointToScreen(e.Location),"left",e.Clicks,0);};
            MouseUp+=delegate(object sender,Forms.MouseEventArgs e){if(e.Button!=Forms.MouseButtons.Left)return;owner.ForwardMouse("mouseReleased",PointToScreen(e.Location),"left",1,0);Capture=false;};
            MouseWheel+=delegate(object sender,Forms.MouseEventArgs e){owner.ForwardMouse("mouseWheel",PointToScreen(e.Location),"none",0,-e.Delta);};
        }
        protected override bool ShowWithoutActivation{get{return true;}}
        protected override Forms.CreateParams CreateParams{
            get{Forms.CreateParams value=base.CreateParams;value.ExStyle|=WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE;return value;}
        }
        protected override void WndProc(ref Forms.Message message){if(message.Msg==0x21){message.Result=new IntPtr(3);return;}base.WndProc(ref message);}
    }
    [StructLayout(LayoutKind.Sequential)]struct NativePoint{public int X,Y;}
    delegate bool EnumWindowsProc(IntPtr hwnd,IntPtr state);
    [DllImport("user32.dll")]static extern bool EnumWindows(EnumWindowsProc callback,IntPtr state);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string className,string title);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string className,string title);
    [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int w,int h,uint flags);
    [DllImport("user32.dll")]static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("user32.dll")]static extern int SetWindowLong(IntPtr window,int index,int value);
    [DllImport("user32.dll")]static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")]static extern bool PostMessage(IntPtr window,int message,IntPtr wParam,IntPtr lParam);

    [STAThread]public static void Main(string[] args)
    {
        if(args.Contains("--install-only")){
            try{OverlayPaths.Install(AppDomain.CurrentDomain.BaseDirectory);File.WriteAllText(Path.Combine(OverlayPaths.Home,"install-status.txt"),"OK");}
            catch(Exception ex){Directory.CreateDirectory(OverlayPaths.Home);File.WriteAllText(Path.Combine(OverlayPaths.Home,"install-status.txt"),"FAILED: "+ex.Message);Environment.ExitCode=1;}
            return;
        }
        if(args.Contains("--install")){
            Forms.Application.EnableVisualStyles();Forms.Application.Run(new OverlayInstaller());return;
        }
        IntPtr old=FindWindow(null,"Miku 桌面歌词");if(old!=IntPtr.Zero){PostMessage(old,WM_SHOWLAYER,IntPtr.Zero,IntPtr.Zero);return;}
        System.Windows.Application app=new System.Windows.Application();app.ShutdownMode=ShutdownMode.OnMainWindowClose;app.Run(new DesktopOverlay());
    }
}
public sealed class OverlayInstaller:Forms.Form
{
    Forms.Label label=new Forms.Label();Forms.Button install=new Forms.Button();bool installing;
    public OverlayInstaller()
    {
        Text="安装 Miku 透明桌面叠加层";Font=new System.Drawing.Font("Microsoft YaHei UI",10);AutoScaleMode=Forms.AutoScaleMode.Dpi;
        ClientSize=new System.Drawing.Size(560,260);FormBorderStyle=Forms.FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=Forms.FormStartPosition.CenterScreen;
        label.Text="保留原版漂浮歌词和胶囊播放器，背景交给 Wallpaper Engine。\n\n换壁纸时歌词和播放器仍保留，没有窗口边框。\n空白区域可点击桌面图标，右下角托盘提供显示、设置和退出。";
        label.SetBounds(24,24,512,154);Controls.Add(label);
        install.Text="安装并打开";install.SetBounds(24,192,512,42);Controls.Add(install);
        install.Click+=async delegate{
            install.Enabled=false;installing=true;label.Text="正在安装透明桌面叠加层…";
            try{await Task.Run(delegate{OverlayPaths.Install(AppDomain.CurrentDomain.BaseDirectory);});Process.Start(new ProcessStartInfo(Path.Combine(OverlayPaths.Home,"MikuDeskLayer.exe")){WorkingDirectory=OverlayPaths.Home});installing=false;Close();}
            catch(Exception ex){label.Text="安装未完成："+ex.Message;install.Enabled=true;installing=false;}
        };
        FormClosing+=delegate(object sender,Forms.FormClosingEventArgs e){if(installing)e.Cancel=true;};
    }
}
