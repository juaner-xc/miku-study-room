using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
class NativeGuardTests
{
    class Fixture:Form {
        public Fixture(bool layered){ShowInTaskbar=false;FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;Bounds=new Rectangle(-30000,-30000,1280,800);if(layered)Opacity=0.01;}
        protected override bool ShowWithoutActivation{get{return true;}}
    }
    static void Check(bool value,string label){if(!value)throw new Exception(label);Console.WriteLine("PASS: "+label);}
    [DllImport("user32.dll")]static extern int GetWindowLong(IntPtr window,int index);
    [STAThread]static void Main(){
        int[] owned={Process.GetCurrentProcess().Id};int corrected;
        using(Fixture browser=new Fixture(true)){
            browser.Show();
            Check((GetWindowLong(browser.Handle,-20)&0x20)==0,"fixture models a browser window that intercepts input");
            Check(NativeInputGuard.Enforce(IntPtr.Zero,owned,new IntPtr[0],1280,800,out corrected),"layered browser window can be repaired");
            Check((GetWindowLong(browser.Handle,-20)&0x20)!=0,"browser input is made transparent");
            Check((GetWindowLong(browser.Handle,-20)&0x08000000)!=0,"browser window cannot take activation");
            browser.Close();
        }
        using(Fixture unsafeWindow=new Fixture(false)){
            unsafeWindow.Show();
            Check(!NativeInputGuard.Enforce(IntPtr.Zero,owned,new IntPtr[0],1280,800,out corrected),"unverifiable fullscreen native window triggers fail-closed");
            unsafeWindow.Close();
        }
        using(Fixture controls=new Fixture(true)){
            controls.Show();int before=GetWindowLong(controls.Handle,-20);
            Check(NativeInputGuard.Enforce(IntPtr.Zero,owned,new[]{controls.Handle},1280,800,out corrected),"explicit control proxy remains usable");
            Check(GetWindowLong(controls.Handle,-20)==before,"control proxy style is not overwritten");
            controls.Close();
        }
        Console.WriteLine("ALL NATIVE INPUT GUARD TESTS PASSED");
    }
}
