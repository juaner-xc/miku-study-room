using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Now Playing Bridge
// 1) 控制：/next.gif /prev.gif /playpause.gif 发送系统媒体键
// 2) 歌单同步：/queue.version /queue.json 读取网易云客户端当前播放队列
internal static class Bridge
{
    private static int Port = 51789;
    private static readonly int[] PortCandidates = { 51789, 52789, 53789, 54789 };

    private const ushort VK_MEDIA_NEXT = 0xB0;
    private const ushort VK_MEDIA_PREV = 0xB1;
    private const ushort VK_MEDIA_PLAY_PAUSE = 0xB3;

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    private static readonly string QueuePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "NetEase", "CloudMusic", "webdata", "file", "playingList");

    private static string _queueCache;
    private static string _queueVersion = "0:0";

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUT
    {
        [FieldOffset(0)] public uint type;
        [FieldOffset(4)] public MOUSEINPUT mi;
        [FieldOffset(4)] public KEYBDINPUT ki;
        [FieldOffset(4)] public HARDWAREINPUT hi;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    private static void PressMediaKey(ushort vk)
    {
        keybd_event((byte)vk, 0, 0, UIntPtr.Zero);
        keybd_event((byte)vk, 0, 2, UIntPtr.Zero);
    }

    private static readonly byte[] Gif = Convert.FromBase64String(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");

    private static string GetQueue(out string version)
    {
        version = "0:0";
        try
        {
            FileInfo fi = new FileInfo(QueuePath);
            if (!fi.Exists) return null;

            version = fi.LastWriteTimeUtc.Ticks + ":" + fi.Length;
            if (version == _queueVersion && _queueCache != null) return _queueCache;

            using (FileStream fs = new FileStream(
                QueuePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (MemoryStream ms = new MemoryStream())
            {
                fs.CopyTo(ms);
                _queueCache = Encoding.UTF8.GetString(ms.ToArray());
                _queueVersion = version;
                return _queueCache;
            }
        }
        catch
        {
            return _queueCache;
        }
    }

    private static void Send(NetworkStream stream, string type, byte[] body)
    {
        string header =
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: " + type + "\r\n" +
            "Content-Length: " + body.Length + "\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Private-Network: true\r\n" +
            "Cache-Control: no-store\r\n" +
            "Connection: close\r\n\r\n";

        byte[] head = Encoding.ASCII.GetBytes(header);
        stream.Write(head, 0, head.Length);
        stream.Write(body, 0, body.Length);
        stream.Flush();
    }


    private static string Esc(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    private static readonly Dictionary<string, string> NowCache = new Dictionary<string, string>();


    private static string Norm(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        StringBuilder sb = new StringBuilder();
        foreach (char ch in s.ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
        }
        return sb.ToString();
    }

    private static bool FindInQueue(string title, string artist, out string id, out long duration, out string pic)
    {
        id = "";
        duration = 0;
        pic = "";
        try
        {
            string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"NetEase\CloudMusic\webdata\file\playingList");
            if (!File.Exists(path)) return false;

            JavaScriptSerializer ser = new JavaScriptSerializer();
            Dictionary<string, object> root = ser.Deserialize<Dictionary<string, object>>(File.ReadAllText(path, Encoding.UTF8));
            System.Collections.IList list = root.ContainsKey("list") ? root["list"] as System.Collections.IList : null;
            if (list == null) return false;

            string wantName = Norm(title);
            string wantArtist = Norm(artist);
            int best = 0;

            foreach (object item in list)
            {
                Dictionary<string, object> it = item as Dictionary<string, object>;
                if (it == null || !it.ContainsKey("track")) continue;
                Dictionary<string, object> tr = it["track"] as Dictionary<string, object>;
                if (tr == null || !tr.ContainsKey("name")) continue;

                string nm = Norm(Convert.ToString(tr["name"]));
                int score = 0;
                if (nm.Length > 0 && nm == wantName) score += 100;
                else if (nm.Length > 0 && wantName.Length > 0 && (nm.Contains(wantName) || wantName.Contains(nm))) score += 60;
                else continue;

                System.Collections.IList ar = tr.ContainsKey("artists") ? tr["artists"] as System.Collections.IList : null;
                if (ar != null)
                {
                    foreach (object ao in ar)
                    {
                        Dictionary<string, object> a = ao as Dictionary<string, object>;
                        if (a == null) continue;
                        string an = Norm(Convert.ToString(a["name"]));
                        if (an.Length == 0) continue;
                        if (an == wantArtist) { score += 60; break; }
                        if (wantArtist.Length > 0 && (an.Contains(wantArtist) || wantArtist.Contains(an))) { score += 30; break; }
                    }
                }

                if (score > best)
                {
                    best = score;
                    id = Convert.ToString(tr["id"]);
                    duration = 0;
                    pic = "";
                    if (tr.ContainsKey("album"))
                    {
                        Dictionary<string, object> al = tr["album"] as Dictionary<string, object>;
                        if (al != null && al.ContainsKey("picUrl")) pic = Convert.ToString(al["picUrl"]);
                    }
                    if (tr.ContainsKey("duration") && tr["duration"] != null)
                        long.TryParse(Convert.ToString(tr["duration"]), out duration);
                }
            }

            return !string.IsNullOrEmpty(id);
        }
        catch
        {
            return false;
        }
    }

    private static string SearchSong(string title, string artist, out string id, out long duration)
    {
        id = "";
        duration = 0;

        try
        {
            string q = Uri.EscapeDataString((title + " " + artist).Trim());
            string url = "https://music.163.com/api/search/get/web?csrf_token=&s=" + q + "&type=1&offset=0&total=true&limit=10";

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "Mozilla/5.0";
            req.Referer = "https://music.163.com/";
            req.Proxy = null;
            req.Timeout = 4000;

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                string json = sr.ReadToEnd();
                JavaScriptSerializer ser = new JavaScriptSerializer();
                Dictionary<string, object> root = ser.Deserialize<Dictionary<string, object>>(json);
                if (root == null || !root.ContainsKey("result")) return null;

                Dictionary<string, object> result = root["result"] as Dictionary<string, object>;
                if (result == null || !result.ContainsKey("songs")) return null;

                System.Collections.IList songs = result["songs"] as System.Collections.IList;
                if (songs == null || songs.Count == 0) return null;

                Func<string, string> norm = Norm;

                string wantName = norm(title);
                string wantArtist = norm(artist);
                string titleLow = title.ToLowerInvariant();

                Dictionary<string, object> bestSong = null;
                int bestScore = -1000;

                foreach (object item in songs)
                {
                    Dictionary<string, object> so = item as Dictionary<string, object>;
                    if (so == null || !so.ContainsKey("name")) continue;

                    string nm = Convert.ToString(so["name"]);
                    string nn = norm(nm);
                    int score = 0;

                    if (nn.Length > 0 && nn == wantName) score += 100;
                    else if (nn.Length > 0 && wantName.Length > 0 && (nn.Contains(wantName) || wantName.Contains(nn))) score += 65;

                    System.Collections.IList ar = so.ContainsKey("artists") ? so["artists"] as System.Collections.IList : null;
                    if (ar != null)
                    {
                        foreach (object ao in ar)
                        {
                            Dictionary<string, object> a = ao as Dictionary<string, object>;
                            if (a == null) continue;
                            string an = norm(Convert.ToString(a["name"]));
                            if (an.Length == 0) continue;
                            if (an == wantArtist) { score += 60; break; }
                            if (wantArtist.Length > 0 && (an.Contains(wantArtist) || wantArtist.Contains(an))) { score += 35; break; }
                        }
                    }

                    string low = nm.ToLowerInvariant();
                    bool suspicious = low.Contains("cover") || low.Contains("翻唱") || low.Contains("伴奏")
                        || low.Contains("dj") || low.Contains("live") || low.Contains("remix");
                    if (suspicious && !titleLow.Contains("live") && !titleLow.Contains("dj")) score -= 35;

                    if (score > bestScore) { bestScore = score; bestSong = so; }
                }

                Dictionary<string, object> song = bestSong != null ? bestSong : (songs[0] as Dictionary<string, object>);
                if (song == null) return null;
                string name = Convert.ToString(song["name"]);
                string art = "";
                System.Collections.IList artists = song.ContainsKey("artists") ? song["artists"] as System.Collections.IList : null;
                if (artists != null && artists.Count > 0)
                {
                    Dictionary<string, object> a = artists[0] as Dictionary<string, object>;
                    if (a != null) art = Convert.ToString(a["name"]);
                }

                return name + "\u0001" + art;
            }
        }
        catch (Exception ex)
        {
            return null;
        }
    }


    private static readonly Dictionary<string, string> CoverCache = new Dictionary<string, string>();

    private static string GetCover(string id)
    {
        if (CoverCache.ContainsKey(id)) return CoverCache[id];
        try
        {
            string url = "https://music.163.com/api/song/detail?ids=%5B" + id + "%5D";
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "Mozilla/5.0";
            req.Referer = "https://music.163.com/";
            req.Proxy = null;
            req.Timeout = 4000;

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                string json = sr.ReadToEnd();
                JavaScriptSerializer ser = new JavaScriptSerializer();
                Dictionary<string, object> root = ser.Deserialize<Dictionary<string, object>>(json);
                System.Collections.IList songs = root.ContainsKey("songs") ? root["songs"] as System.Collections.IList : null;
                if (songs != null && songs.Count > 0)
                {
                    Dictionary<string, object> song = songs[0] as Dictionary<string, object>;
                    Dictionary<string, object> album = song["album"] as Dictionary<string, object>;
                    if (album != null && album.ContainsKey("picUrl"))
                    {
                        string pic = Convert.ToString(album["picUrl"]);
                        if (!string.IsNullOrEmpty(pic))
                        {
                            CoverCache[id] = pic;
                            return pic;
                        }
                    }
                }
            }
        }
        catch { }
        return null;
    }

    private static string GetNowJson()
    {
        try
        {
            foreach (Process p in Process.GetProcessesByName("cloudmusic"))
            {
                string t = p.MainWindowTitle;
                if (string.IsNullOrWhiteSpace(t)) continue;

                string title = t;
                string artist = "";
                int idx = t.LastIndexOf(" - ", StringComparison.Ordinal);
                if (idx > 0)
                {
                    title = t.Substring(0, idx).Trim();
                    artist = t.Substring(idx + 3).Trim();
                }

                string key = title + "|" + artist;
                if (NowCache.ContainsKey(key)) return NowCache[key];

                string id;
                long duration;
                string found = null;
                string queuePic;
                if (!FindInQueue(title, artist, out id, out duration, out queuePic))
                {
                    found = SearchSong(title, artist, out id, out duration);
                }

                if (!string.IsNullOrEmpty(found))
                {
                    string[] parts = found.Split('\u0001');
                    if (parts.Length > 1 && !string.IsNullOrEmpty(parts[1])) artist = parts[1];
                }

                string json;
                if (!string.IsNullOrEmpty(id))
                {
                    string pic = queuePic;
                    if (string.IsNullOrEmpty(pic)) pic = GetCover(id);
                    if (string.IsNullOrEmpty(pic)) pic = "https://api.injahow.cn/meting/?server=netease&type=pic&id=" + id;
                    string lrc = "https://api.injahow.cn/meting/?server=netease&type=lrc&id=" + id;
                    json = "{\"ok\":true,\"title\":\"" + Esc(title) + "\",\"artist\":\"" + Esc(artist) +
                           "\",\"id\":\"" + id + "\",\"pic\":\"" + Esc(pic) + "\",\"lrc\":\"" + Esc(lrc) +
                           "\",\"duration\":" + (duration / 1000) + "}";
                }
                else
                {
                    json = "{\"ok\":true,\"title\":\"" + Esc(title) + "\",\"artist\":\"" + Esc(artist) + "\",\"id\":\"\"}";
                }

                if (NowCache.Count > 80) NowCache.Clear();
                NowCache[key] = json;
                return json;
            }
        }
        catch { }

        return "{\"ok\":false}";
    }


    private static readonly Dictionary<string, List<byte>> Hotkeys = new Dictionary<string, List<byte>>();

    private static readonly Dictionary<string, byte> KeyMap = new Dictionary<string, byte>(StringComparer.OrdinalIgnoreCase)
    {
        { "ctrl", 0x11 }, { "control", 0x11 },
        { "alt", 0x12 }, { "menu", 0x12 },
        { "shift", 0x10 },
        { "win", 0x5B },
        { "left", 0x25 }, { "up", 0x26 }, { "right", 0x27 }, { "down", 0x28 },
        { "space", 0x20 }, { "enter", 0x0D }, { "tab", 0x09 }, { "esc", 0x1B },
        { "play", 0xB3 }, { "next", 0xB0 }, { "prev", 0xB1 }
    };

    private static byte KeyCode(string token)
    {
        byte code;
        if (KeyMap.TryGetValue(token, out code)) return code;
        if (token.Length == 1)
        {
            char c = char.ToUpperInvariant(token[0]);
            if (c >= 'A' && c <= 'Z') return (byte)c;
            if (c >= '0' && c <= '9') return (byte)c;
        }
        return 0;
    }

    private static void LoadHotkeys()
    {
        string file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hotkeys.ini");
        if (File.Exists(file))
        {
            foreach (string raw in File.ReadAllLines(file))
            {
                string line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;

                string name = line.Substring(0, eq).Trim().ToLowerInvariant();
                string combo = line.Substring(eq + 1).Trim();
                if (combo.Length == 0) continue;

                List<byte> keys = new List<byte>();
                bool ok = true;
                foreach (string token in combo.Split('+'))
                {
                    byte k = KeyCode(token.Trim());
                    if (k == 0) { ok = false; break; }
                    keys.Add(k);
                }
                if (ok && keys.Count > 0) Hotkeys[name] = keys;
            }
        }
    }

    private static void SendCombo(List<byte> keys)
    {
        for (int i = 0; i < keys.Count - 1; i++)
            keybd_event(keys[i], 0, 0, UIntPtr.Zero);

        byte main = keys[keys.Count - 1];
        keybd_event(main, 0, 0, UIntPtr.Zero);
        keybd_event(main, 0, 2, UIntPtr.Zero);

        for (int i = keys.Count - 2; i >= 0; i--)
            keybd_event(keys[i], 0, 2, UIntPtr.Zero);
    }

    private static void SendAction(string name)
    {
        List<byte> keys;
        if (Hotkeys.TryGetValue(name, out keys) && keys.Count > 0)
        {
            SendCombo(keys);
            return;
        }

        ushort vk = VK_MEDIA_PLAY_PAUSE;
        if (name == "next") vk = VK_MEDIA_NEXT;
        else if (name == "prev") vk = VK_MEDIA_PREV;
        PressMediaKey(vk);
    }


    private static bool WallpaperControl(string command)
    {
        try
        {
            string exe = null;

            Process[] p32 = Process.GetProcessesByName("wallpaper32");
            if (p32.Length > 0)
            {
                try { exe = p32[0].MainModule.FileName; } catch { }
            }

            if (string.IsNullOrEmpty(exe))
            {
                Process[] p64 = Process.GetProcessesByName("wallpaper64");
                if (p64.Length > 0)
                {
                    try { exe = p64[0].MainModule.FileName; } catch { }
                }
            }

            if (string.IsNullOrEmpty(exe))
            {
                string[] guesses = new string[]
                {
                    @"C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe",
                    @"D:\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe",
                    @"E:\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe"
                };
                foreach (string g in guesses)
                {
                    if (File.Exists(g)) { exe = g; break; }
                }
            }

            if (string.IsNullOrEmpty(exe) || !File.Exists(exe)) return false;

            ProcessStartInfo psi = new ProcessStartInfo(exe, "-control " + command);
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
            return true;
        }
        catch
        {
            return false;
        }
    }


    private static string QueryValue(string query, string key)
    {
        if (string.IsNullOrEmpty(query)) return "";
        string q = query.StartsWith("?") ? query.Substring(1) : query;
        foreach (string pair in q.Split('&'))
        {
            int eq = pair.IndexOf('=');
            if (eq <= 0) continue;
            if (pair.Substring(0, eq) == key)
                return Uri.UnescapeDataString(pair.Substring(eq + 1).Replace("+", " "));
        }
        return "";
    }

    private static string B64(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        s = s.Replace(" ", "+");
        int mod = s.Length % 4;
        if (mod == 2) s += "==";
        else if (mod == 3) s += "=";
        else if (mod == 1) s += "===";
        return Encoding.UTF8.GetString(Convert.FromBase64String(s));
    }


    private static Dictionary<string, string> ReadAiIni()
    {
        Dictionary<string, string> d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            string file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ai.ini");
            if (!File.Exists(file)) return d;
            foreach (string raw in File.ReadAllLines(file, Encoding.UTF8))
            {
                string line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
        }
        catch { }
        return d;
    }

    private static string ProxyAi(string path)
    {
        try
        {
            Dictionary<string, string> cfg = ReadAiIni();
            string enabled = cfg.ContainsKey("enabled") ? cfg["enabled"] : "0";
            if (enabled != "1")
                return "{\"error\":\"ai disabled in ai.ini\"}";

            string baseUrl = cfg.ContainsKey("base") ? cfg["base"].Trim().TrimEnd('/') : "";
            string key = cfg.ContainsKey("key") ? cfg["key"].Trim() : "";
            string model = cfg.ContainsKey("model") ? cfg["model"].Trim() : "";

            if (baseUrl.Length == 0 || key.Length == 0)
                return "{\"error\":\"ai.ini missing base or key\"}";

            string q = path.Contains("?") ? path.Substring(path.IndexOf('?')) : "";
            string prompt = B64(QueryValue(q, "p"));
            if (prompt.Length == 0)
                return "{\"error\":\"empty prompt\"}";

            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 1024 * 1024;

            var payload = new Dictionary<string, object>();
            payload["model"] = model.Length > 0 ? model : "deepseek-chat";
            payload["temperature"] = 0.8;
            payload["messages"] = new object[]
            {
                new Dictionary<string, object>
                {
                    { "role", "user" },
                    { "content", prompt }
                }
            };

            string body = ser.Serialize(payload);

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(baseUrl + "/chat/completions");
            req.Method = "POST";
            req.ContentType = "application/json";
            req.Headers["Authorization"] = "Bearer " + key;
            req.Proxy = null;
            req.Timeout = 60000;

            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream rs = req.GetRequestStream()) rs.Write(bytes, 0, bytes.Length);

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return sr.ReadToEnd();
            }
        }
        catch (WebException wex)
        {
            try
            {
                if (wex.Response != null)
                {
                    using (StreamReader er = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                        return "{\"error\":" + Quote(er.ReadToEnd()) + "}";
                }
            }
            catch { }
            return "{\"error\":" + Quote(wex.Message) + "}";
        }
        catch (Exception ex)
        {
            return "{\"error\":" + Quote(ex.Message) + "}";
        }
    }

    private static string Quote(string s)
    {
        return "\"" + Esc(s) + "\"";
    }

    private static void Main()
    {
        bool createdNew;
        LoadHotkeys();

        using (var mutex = new Mutex(true, "NowPlayingWallpaperBridge", out createdNew))
        {
            if (!createdNew) return;

            TcpListener listener = null;
            foreach (int candidate in PortCandidates)
            {
                try
                {
                    var probe = new TcpListener(IPAddress.Loopback, candidate);
                    probe.Start();
                    listener = probe;
                    Port = candidate;
                    break;
                }
                catch { }
            }
            if (listener == null) return;

            try
            {
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "port.txt"), Port.ToString());
            }
            catch { }

            while (true)
            {
                try
                {
                    using (TcpClient client = listener.AcceptTcpClient())
                    {
                        client.ReceiveTimeout = 2000;
                        NetworkStream stream = client.GetStream();

                        byte[] buffer = new byte[65536];
                        int read = 0;
                        int total = 0;
                        while (total < buffer.Length)
                        {
                            read = stream.Read(buffer, total, buffer.Length - total);
                            if (read <= 0) break;
                            total += read;
                            string sofar = Encoding.ASCII.GetString(buffer, 0, total);
                            if (sofar.IndexOf("\r\n\r\n") >= 0) break;
                        }
                        if (total <= 0) continue;

                        string request = Encoding.ASCII.GetString(buffer, 0, total);
                        string path = string.Empty;
                        string rawPath = string.Empty;
                        string[] parts = request.Split(' ');
                        if (parts.Length > 1) { rawPath = parts[1]; path = rawPath.ToLowerInvariant(); }

                        if (path.StartsWith("/queue.version"))
                        {
                            string version;
                            GetQueue(out version);
                            Send(stream, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(version));
                        }
                        else if (path.StartsWith("/queue.json"))
                        {
                            string version;
                            string json = GetQueue(out version);
                            if (string.IsNullOrEmpty(json)) json = "{\"list\":[]}";
                            Send(stream, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                        }
                        else if (path.StartsWith("/ai.config"))
                        {
                            Dictionary<string, string> cfg = ReadAiIni();
                            string en = cfg.ContainsKey("enabled") && cfg["enabled"] == "1" ? "true" : "false";
                            string bse = cfg.ContainsKey("base") ? cfg["base"] : "";
                            string mdl = cfg.ContainsKey("model") ? cfg["model"] : "";
                            string json = "{\"enabled\":" + en + ",\"base\":\"" + Esc(bse) + "\",\"model\":\"" + Esc(mdl) + "\"}";
                            Send(stream, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                        }
                        else if (path.StartsWith("/ai.theme"))
                        {
                            Send(stream, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(ProxyAi(rawPath)));
                        }
                        else if (path.StartsWith("/now.json"))
                        {
                            Send(stream, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(GetNowJson()));
                        }
                        else
                        {
                            if (path.StartsWith("/next")) SendAction("next");
                            else if (path.StartsWith("/prev")) SendAction("prev");
                            else if (path.StartsWith("/playpause")) SendAction("playpause");
                            else if (path.StartsWith("/ai.open"))
                        {
                            try { Process.Start(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "AiSettings.exe")); } catch { }
                            Send(stream, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"ok\":true}"));
                        }
                        else if (path.StartsWith("/hideicons")) WallpaperControl("hideIcons");
                            else if (path.StartsWith("/showicons")) WallpaperControl("showIcons");
                            Send(stream, "image/gif", Gif);
                        }
                    }
                }
                catch
                {
                    // 单个连接出错不影响整体
                }
            }
        }
    }
}
