using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using System.Security.Principal;

public sealed class AiConfig
{
    public bool Enabled;
    public string Base = "", Model = "", Key = "";
    public static AiConfig Load(string path)
    {
        AiConfig c = new AiConfig();
        if (!File.Exists(path)) return c;
        foreach (string line in File.ReadAllLines(path, Encoding.UTF8)) {
            int eq = line.IndexOf('='); if (eq < 1) continue;
            string name = line.Substring(0, eq).Trim(), value = line.Substring(eq + 1).Trim();
            if (name == "enabled") c.Enabled = value == "1";
            if (name == "base") c.Base = value;
            if (name == "model") c.Model = value;
            if (name == "keyProtected" && value.Length > 0) {
                try { c.Key = Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser)); }
                catch { c.Enabled = false; }
            }
        }
        if (c.Key.Length == 0) c.Enabled = false; // Never import a bundled / legacy plaintext key.
        return c;
    }
    public static string NormalizeBase(string input)
    {
        string value = input.Trim().TrimEnd('/');
        if (value.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase)) value = value.Substring(0, value.Length - 17);
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || !String.IsNullOrEmpty(uri.UserInfo) || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment)
            || !(uri.Scheme == "https" || (uri.Scheme == "http" && uri.IsLoopback)))
            throw new ArgumentException("请填写 HTTPS 接口地址；本机服务可使用 http://127.0.0.1。地址不要包含参数或账号。");
        return value;
    }
    public void Validate(bool requireKey)
    {
        Base = NormalizeBase(Base);
        Model = Model.Trim(); Key = Key.Trim();
        if (Model.Length == 0 || Model.IndexOfAny(new char[] {'\r', '\n'}) >= 0) throw new ArgumentException("请填写服务商提供的模型名称。");
        if (Key.IndexOfAny(new char[] {'\r', '\n'}) >= 0 || (requireKey && Key.Length == 0)) throw new ArgumentException("请填写你自己的 API Key。");
    }
    public void Save(string path)
    {
        if (Enabled) Validate(true);
        // Validate non-empty fields even when disabled, to keep INI one-value-per-line.
        else { if (Base.Length > 0) Base = NormalizeBase(Base); if ((Model + Key).IndexOfAny(new char[] {'\r','\n'}) >= 0) throw new ArgumentException("设置不能包含换行。"); }
        string protectedKey = Key.Length == 0 ? "" : Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(Key), null, DataProtectionScope.CurrentUser));
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        string temp = path + ".new";
        File.WriteAllText(temp, "enabled=" + (Enabled ? "1" : "0") + "\r\nbase=" + Base + "\r\nmodel=" + Model + "\r\nkeyProtected=" + protectedKey + "\r\n", new UTF8Encoding(false));
        if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
    }
    public void Test()
    {
        Validate(true);
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Base + "/chat/completions");
        req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 20000; req.ReadWriteTimeout = 20000; req.AllowAutoRedirect = false;
        req.Headers["Authorization"] = "Bearer " + Key;
        JavaScriptSerializer ser = new JavaScriptSerializer();
        byte[] data = Encoding.UTF8.GetBytes(ser.Serialize(new { model = Model, messages = new[] { new { role = "user", content = "Reply with OK." } }, max_tokens = 8 }));
        using (Stream s = req.GetRequestStream()) s.Write(data, 0, data.Length);
        using (WebResponse response = req.GetResponse())
        using (StreamReader reader = new StreamReader(response.GetResponseStream())) {
            Dictionary<string, object> result = ser.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
            if (result == null || !result.ContainsKey("choices")) throw new Exception("接口有响应，但没有返回兼容的 choices 字段，请确认地址和模型。");
        }
    }
}
