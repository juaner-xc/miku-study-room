using System;
using System.Linq;
using System.Runtime.InteropServices;
public static class NativeInputGuard
{
    const int GWL_EXSTYLE=-20,TRANSPARENT=0x20,NOACTIVATE=0x08000000,LAYERED=0x80000;
    public static bool Enforce(IntPtr visual,int[] ownedProcesses,IntPtr[] inputProxies,int screenWidth,int screenHeight,out int corrected)
    {
        bool healthy=true;int changes=0;
        EnumWindows(delegate(IntPtr window,IntPtr data){
            uint pid;GetWindowThreadProcessId(window,out pid);
            if(!ownedProcesses.Contains((int)pid) || inputProxies.Contains(window))return true;
            NativeRect bounds;
            if(!GetWindowRect(window,out bounds))return true;
            bool large=bounds.Right-bounds.Left>=screenWidth*.75 && bounds.Bottom-bounds.Top>=screenHeight*.65;
            if(window!=visual && (!large||!IsWindowVisible(window)))return true;
            int before=GetWindowLong(window,GWL_EXSTYLE);
            int wanted=before|TRANSPARENT|NOACTIVATE;
            SetWindowLong(window,GWL_EXSTYLE,wanted);
            if(IsWindow(window) && (GetWindowLong(window,GWL_EXSTYLE)&(TRANSPARENT|NOACTIVATE))!=(TRANSPARENT|NOACTIVATE))healthy=false;
            // Transparency on the outer WPF HWND alone does not protect native browser children.
            EnumChildWindows(window,delegate(IntPtr child,IntPtr state){
                int childStyle=GetWindowLong(child,GWL_EXSTYLE);
                SetWindowLong(child,GWL_EXSTYLE,childStyle|TRANSPARENT|NOACTIVATE);
                return true;
            },IntPtr.Zero);
            if(before!=wanted)changes++;
            // A non-layered fullscreen helper cannot guarantee cross-process click-through.
            // Fail closed instead of leaving an unverified invisible input surface over the desktop.
            if(window!=visual && (before&LAYERED)==0 && IsWindowVisible(window))healthy=false;
            return true;
        },IntPtr.Zero);
        corrected=changes;return healthy;
    }
    public static bool EmergencyExitPressed()
    {
        return (GetAsyncKeyState(0x11)&0x8000)!=0 && (GetAsyncKeyState(0x12)&0x8000)!=0 && (GetAsyncKeyState(0x1B)&0x8000)!=0;
    }
    [StructLayout(LayoutKind.Sequential)]struct NativeRect{public int Left,Top,Right,Bottom;}
    delegate bool EnumProc(IntPtr window,IntPtr state);
    [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc callback,IntPtr data);
    [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr data);
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr window,out NativeRect bounds);
    [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")]static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("user32.dll")]static extern int SetWindowLong(IntPtr window,int index,int value);
    [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
}
