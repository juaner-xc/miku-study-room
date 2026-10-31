using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
class RecordModeTests
{
    class Fixture:Form {
        public Fixture(){ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Bounds=new Rectangle(-30000,-30000,1280,720);Opacity=.01;}
        protected override bool ShowWithoutActivation{get{return true;}}
    }
    [STAThread]static void Main(){
        Application.EnableVisualStyles();
        Fixture form=new Fixture();WebView2 view=new WebView2{Dock=DockStyle.Fill};form.Controls.Add(view);
        form.Shown+=async delegate {
            try{
                string root=AppDomain.CurrentDomain.BaseDirectory;
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"RecordTestCache"));
                await view.EnsureCoreWebView2Async(env);
                view.CoreWebView2.SetVirtualHostNameToFolderMapping("miku-record.test",Path.Combine(root,"player"),CoreWebView2HostResourceAccessKind.DenyCors);
                await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
window.__frames=0;const originalRaf=requestAnimationFrame.bind(window);window.requestAnimationFrame=function(f){window.__frames++;return originalRaf(f)};
window.fetch=async function(url){url=String(url);
 if(url.includes('now.json'))return new Response(JSON.stringify({ok:true,title:'Record test song',artist:'Fixture',id:'fixture',duration:60,lrc:'record-test-lyrics'}));
 if(url==='record-test-lyrics')return new Response('[00:00.00]Test lyric one\n[00:03.00]Test lyric two\n[00:06.00]Test lyric three');
 if(url.includes('ai.config'))return new Response('{""enabled"":false}');
 if(url.includes('queue.version'))return new Response('');
 if(url.includes('queue.json'))return new Response('{""list"":[]}');
 if(url.includes('meting'))return new Response('[]');
 return new Response('{}');
};");
                await Navigate(view,delegate{
                    view.NavigateToString("<!doctype html><html style='background:transparent'><head><meta charset='utf-8'><link rel='stylesheet' href='https://miku-record.test/css/style.css'><link rel='stylesheet' href='https://miku-record.test/css/lyric-record.css'></head><body class='theme-record font-sans'><div id='lyrics'><div class='line'><span class='main'>Font probe</span></div></div><script src='https://miku-record.test/js/lyric-record.js'></script></body></html>");
                });
                await view.ExecuteScriptAsync("MikuRecordLyrics.setLyrics([{t:0,text:'First soft line',sub:'A subtitle'},{t:3,text:'Second light line'},{t:6,text:'Third line'}]);MikuRecordLyrics.setActive(true);MikuRecordLyrics.update(0,true)");
                await Check(view,"first line appears","document.querySelector('.record-main').textContent==='First\\u00a0soft\\u00a0line'");
                await Check(view,"transparent and non-interactive","getComputedStyle(document.getElementById('recordLyrics')).pointerEvents==='none' && getComputedStyle(document.getElementById('recordLyrics')).backgroundColor==='rgba(0, 0, 0, 0)'");
                await view.ExecuteScriptAsync("MikuRecordLyrics.update(3.2,true)");
                await Check(view,"previous line retires while next arrives","document.querySelectorAll('.record-voice').length===2 && document.querySelectorAll('.record-voice.is-retiring').length===1");
                await view.ExecuteScriptAsync("MikuRecordLyrics.update(3.2,false)");
                await Check(view,"pause freezes disc and letter drift","getComputedStyle(document.querySelector('.record-vinyl')).animationPlayState==='paused' && getComputedStyle(document.querySelector('.record-char')).animationPlayState==='paused'");
                await view.ExecuteScriptAsync("MikuRecordLyrics.update(3.2,true)");
                await Check(view,"resume continues motion","getComputedStyle(document.querySelector('.record-vinyl')).animationPlayState==='running'");
                await view.ExecuteScriptAsync("MikuRecordLyrics.update(0.2,true)");
                await Check(view,"backward seek removes old trails","document.querySelectorAll('.record-voice').length===1 && document.querySelector('.record-voice').dataset.index==='0'");
                await view.ExecuteScriptAsync("MikuRecordLyrics.setLyrics([{t:0,text:'<img src=x onerror=alert(1)>'}]);MikuRecordLyrics.update(0,true)");
                await Check(view,"lyric markup rendered as text","document.querySelectorAll('.record-voices img').length===0 && document.querySelector('.record-main').textContent.includes('<img')");
                await view.ExecuteScriptAsync("MikuRecordLyrics.setLyrics(Array.from({length:100},(_,i)=>({t:i*.1,text:'Dense line '+i})));for(let i=0;i<100;i++)MikuRecordLyrics.update(i*.1,true)");
                await Check(view,"dense lyrics keep at most three rows","document.querySelectorAll('.record-voice').length<=3");
                await Check(view,"no additional animation-frame loop","window.__frames===0");
                await view.ExecuteScriptAsync("MikuRecordLyrics.setLyrics([]);MikuRecordLyrics.update(0,true)");
                await Check(view,"missing lyrics handled","!document.querySelector('.record-empty').hidden && document.querySelectorAll('.record-voice').length===0");
                await view.ExecuteScriptAsync("MikuRecordLyrics.setLyrics([{t:10,text:'Future line'}]);MikuRecordLyrics.update(0,true)");
                await Check(view,"instrumental intro handled","document.querySelector('.record-empty').textContent.includes('前奏')");
                await view.ExecuteScriptAsync("MikuRecordLyrics.setActive(false)");
                await Check(view,"switching modes removes record trails","document.getElementById('recordLyrics').hidden && document.querySelectorAll('.record-voice').length===0");
                await Navigate(view,delegate{view.Source=new Uri("https://miku-record.test/index.html");});
                await Task.Delay(1000);
                await Check(view,"record option integrated with six original modes","document.querySelectorAll('#modeChips button').length===7 && Array.from(document.querySelectorAll('#modeChips button')).some(b=>b.textContent==='唱片')");
                await view.ExecuteScriptAsync("Array.from(document.querySelectorAll('#modeChips button')).find(b=>b.textContent==='唱片').click()");
                await Task.Delay(100);
                await Check(view,"real settings select record mode","document.body.classList.contains('theme-record') && !document.getElementById('recordLyrics').hidden && localStorage.getItem('lyricTheme')==='record'");
                await Check(view,"original capsule preserved","!!document.querySelector('#player #play') && !!document.querySelector('#player #settingsBtn')");
                Console.WriteLine("ALL RECORD MODE TESTS PASSED");
            }catch(Exception ex){Console.WriteLine("FAIL: "+ex.Message);Environment.ExitCode=1;}
            finally{view.Dispose();form.Close();}
        };
        Application.Run(form);
    }
    static async Task Navigate(WebView2 view,Action start){
        var done=new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> handler=delegate{done.TrySetResult(true);};
        view.CoreWebView2.NavigationCompleted+=handler;
        try{start();if(await Task.WhenAny(done.Task,Task.Delay(15000))!=done.Task)throw new Exception("Navigation timeout");await Task.Delay(150);}
        finally{view.CoreWebView2.NavigationCompleted-=handler;}
    }
    static async Task Check(WebView2 view,string label,string condition){
        string result=await view.ExecuteScriptAsync("Boolean("+condition+")");
        if(result!="true")throw new Exception(label+" returned "+result);
        Console.WriteLine("PASS: "+label);
    }
}
