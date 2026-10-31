using System;
using System.Linq;
using System.Windows;
class OverlayPolicyTests {
    static void Check(bool value,string name){if(!value)throw new Exception(name);Console.WriteLine("PASS: "+name);}
    static void Main(){
        Check(DesktopOverlay.SafeInputRegions(new[]{new Rect(0,0,1920,1080)},1920,1080).Length==0,"fullscreen input surface rejected");
        Check(DesktopOverlay.SafeInputRegions(new[]{new Rect(0,0,1800,600)},1920,1080).Length==0,"oversized input surface rejected");
        Check(DesktopOverlay.SafeInputRegions(new[]{new Rect(600,800,690,100)},1920,1080).Length==1,"capsule input region retained");
        Check(DesktopOverlay.SafeInputRegions(new[]{new Rect(20,150,400,600)},1920,1080).Length==1,"settings input region retained");
        Check(DesktopOverlay.SafeInputRegions(new[]{new Rect(0,0,10,10)},0,1080).Length==0,"invalid viewport fails closed");
        Check(DesktopOverlay.SafeInputRegions(Enumerable.Repeat(new Rect(0,0,20,20),40),1920,1080).Length==8,"input windows bounded");
        Rect clipped=DesktopOverlay.SafeInputRegions(new[]{new Rect(-20,-20,80,80)},1920,1080)[0];
        Check(clipped.Left==0 && clipped.Top==0 && clipped.Width==60,"input clipped to screen");
        Console.WriteLine("ALL INPUT POLICY TESTS PASSED");
    }
}
