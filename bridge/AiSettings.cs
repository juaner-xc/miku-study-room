using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class AiSettingsForm : Form
{
    private TextBox txtBase;
    private TextBox txtKey;
    private TextBox txtModel;
    private CheckBox chkEnabled;
    private ComboBox cbPreset;
    private Label lblStatus;
    private Button btnSave;
    private Button btnTest;
    private Button btnKey;
    private readonly string iniPath;

    private static readonly Dictionary<string, string[]> Presets = new Dictionary<string, string[]>
    {
        { "DeepSeek（推荐，便宜）", new string[] { "https://api.deepseek.com/v1", "deepseek-chat" } },
        { "OpenAI", new string[] { "https://api.openai.com/v1", "gpt-4o-mini" } },
        { "自定义（OpenAI 兼容）", null }
    };

    public AiSettingsForm()
    {
        iniPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ai.ini");

        Text = "Miku 壁纸 · AI 主题设置";
        ClientSize = new Size(500, 424);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        Font = new Font("Microsoft YaHei UI", 9.5f);
        BackColor = Color.FromArgb(250, 250, 252);

        Label title = new Label();
        title.Text = "AI 主题（可选）";
        title.Font = new Font("Microsoft YaHei UI", 14f, FontStyle.Bold);
        title.Location = new Point(24, 18);
        title.AutoSize = true;
        Controls.Add(title);

        Label sub = new Label();
        sub.Text = "不开启也能正常用：默认从专辑封面取色，完全免费。";
        sub.ForeColor = Color.FromArgb(110, 110, 120);
        sub.Location = new Point(26, 52);
        sub.AutoSize = true;
        Controls.Add(sub);

        chkEnabled = new CheckBox();
        chkEnabled.Text = "启用 AI 主题（按歌曲生成配色）";
        chkEnabled.Location = new Point(26, 84);
        chkEnabled.AutoSize = true;
        Controls.Add(chkEnabled);

        Label l1 = MakeLabel("服务商", 26, 118);
        cbPreset = new ComboBox();
        cbPreset.DropDownStyle = ComboBoxStyle.DropDownList;
        cbPreset.Location = new Point(120, 114);
        cbPreset.Width = 340;
        foreach (string k in Presets.Keys) cbPreset.Items.Add(k);
        cbPreset.SelectedIndex = 0;
        cbPreset.SelectedIndexChanged += PresetChanged;
        Controls.Add(cbPreset);

        Label l2 = MakeLabel("接口地址", 26, 156);
        txtBase = MakeText(120, 152, 340);
        Controls.Add(txtBase);

        Label l3 = MakeLabel("API Key", 26, 194);
        txtKey = MakeText(120, 190, 340);
        txtKey.UseSystemPasswordChar = true;
        Controls.Add(txtKey);

        Label l4 = MakeLabel("模型", 26, 232);
        txtModel = MakeText(120, 228, 340);
        Controls.Add(txtModel);

        btnKey = new Button();
        btnKey.Text = "获取 Key";
        btnKey.Location = new Point(380, 264);
        btnKey.Width = 80;
        btnKey.Click += delegate { OpenKeyPage(); };
        Controls.Add(btnKey);

        btnTest = new Button();
        btnTest.Text = "测试连接";
        btnTest.Location = new Point(120, 264);
        btnTest.Width = 110;
        btnTest.Click += delegate { TestConnection(); };
        Controls.Add(btnTest);

        lblStatus = new Label();
        lblStatus.Text = "";
        lblStatus.ForeColor = Color.FromArgb(110, 110, 120);
        lblStatus.Location = new Point(26, 300);
        lblStatus.AutoSize = true;
        Controls.Add(lblStatus);

        btnSave = new Button();
        btnSave.Text = "保存";
        btnSave.Location = new Point(380, 364);
        btnSave.Width = 94;
        btnSave.Height = 32;
        btnSave.Click += delegate { SaveAndClose(); };
        Controls.Add(btnSave);

        Button btnCancel = new Button();
        btnCancel.Text = "取消";
        btnCancel.Location = new Point(276, 364);
        btnCancel.Width = 94;
        btnCancel.Height = 32;
        btnCancel.Click += delegate { Close(); };
        Controls.Add(btnCancel);

        Label foot = new Label();
        foot.Text = "Key 只保存在本机 bridge\\ai.ini，不会上传到别处。";
        foot.ForeColor = Color.FromArgb(140, 140, 150);
        foot.Location = new Point(26, 330);
        foot.AutoSize = true;
        Controls.Add(foot);

        LoadIni();
    }

    private Label MakeLabel(string text, int x, int y)
    {
        Label l = new Label();
        l.Text = text;
        l.Location = new Point(x, y);
        l.AutoSize = true;
        l.ForeColor = Color.FromArgb(60, 60, 70);
        Controls.Add(l);
        return l;
    }

    private TextBox MakeText(int x, int y, int w)
    {
        TextBox t = new TextBox();
        t.Location = new Point(x, y);
        t.Width = w;
        t.BorderStyle = BorderStyle.FixedSingle;
        return t;
    }

    private void PresetChanged(object sender, EventArgs e)
    {
        string name = cbPreset.SelectedItem as string;
        if (name == null) return;
        string[] p = Presets[name];
        if (p == null) return;

        txtBase.Text = p[0];
        txtModel.Text = p[1];
    }

    private void LoadIni()
    {
        Dictionary<string, string> d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            if (File.Exists(iniPath))
            {
                foreach (string raw in File.ReadAllLines(iniPath, Encoding.UTF8))
                {
                    string line = raw.Trim();
                    if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
                }
            }
        }
        catch { }

        chkEnabled.Checked = d.ContainsKey("enabled") && d["enabled"] == "1";
        txtBase.Text = d.ContainsKey("base") ? d["base"] : "https://api.deepseek.com/v1";
        txtKey.Text = d.ContainsKey("key") ? d["key"] : "";
        txtModel.Text = d.ContainsKey("model") ? d["model"] : "deepseek-chat";

        if (txtBase.Text.IndexOf("api.deepseek.com", StringComparison.OrdinalIgnoreCase) >= 0)
            cbPreset.SelectedIndex = 0;
        else if (txtBase.Text.IndexOf("api.openai.com", StringComparison.OrdinalIgnoreCase) >= 0)
            cbPreset.SelectedIndex = 1;
        else
            cbPreset.SelectedIndex = 2;

        lblStatus.Text = chkEnabled.Checked ? "当前：已启用" : "当前：未启用（免费封面取色）";
    }

    private void SaveAndClose()
    {
        try
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("# 由 Miku 壁纸 AI 设置工具生成");
            sb.AppendLine("enabled=" + (chkEnabled.Checked ? "1" : "0"));
            sb.AppendLine("base=" + txtBase.Text.Trim());
            sb.AppendLine("key=" + txtKey.Text.Trim());
            sb.AppendLine("model=" + txtModel.Text.Trim());
            File.WriteAllText(iniPath, sb.ToString(), new UTF8Encoding(false));

            MessageBox.Show(this, "已保存。\n\n壁纸会在 15 秒内自动读取新配置；\n切一首歌就会生成 AI 主题。",
                "保存成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "保存失败：" + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenKeyPage()
    {
        try
        {
            string url = txtBase.Text.IndexOf("openai.com", StringComparison.OrdinalIgnoreCase) >= 0
                ? "https://platform.openai.com/api-keys"
                : "https://platform.deepseek.com/api_keys";
            System.Diagnostics.Process.Start(url);
        }
        catch { }
    }

    private void TestConnection()
    {
        string baseUrl = txtBase.Text.Trim().TrimEnd('/');
        string key = txtKey.Text.Trim();
        string model = txtModel.Text.Trim();
        if (baseUrl.Length == 0 || key.Length == 0)
        {
            lblStatus.Text = "请先填接口地址和 Key";
            return;
        }

        btnTest.Enabled = false;
        lblStatus.Text = "测试中…";

        Thread t = new Thread(delegate ()
        {
            string result;
            try
            {
                result = CallApi(baseUrl, key, model);
            }
            catch (Exception ex)
            {
                result = "失败：" + ex.Message;
            }

            try
            {
                BeginInvoke(new Action(delegate ()
                {
                    lblStatus.Text = result;
                    btnTest.Enabled = true;
                }));
            }
            catch { }
        });
        t.IsBackground = true;
        t.Start();
    }

    private string CallApi(string baseUrl, string key, string model)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

        string body = "{\"model\":\"" + model.Replace("\"", "") + "\",\"messages\":[{\"role\":\"user\",\"content\":\"只回复两个字：正常\"}],\"max_tokens\":16}";
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(baseUrl + "/chat/completions");
        req.Method = "POST";
        req.ContentType = "application/json";
        req.Headers["Authorization"] = "Bearer " + key;
        req.Proxy = null;
        req.Timeout = 30000;

        byte[] bytes = Encoding.UTF8.GetBytes(body);
        req.ContentLength = bytes.Length;
        using (Stream s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);

        try
        {
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                string text = sr.ReadToEnd();
                int i = text.IndexOf("\"content\":\"", StringComparison.Ordinal);
                if (i >= 0)
                {
                    i += 11;
                    int j = text.IndexOf('"', i);
                    if (j > i) return "连接正常，模型回复：" + text.Substring(i, Math.Min(j - i, 40));
                }
                return "连接正常（HTTP " + (int)resp.StatusCode + "）";
            }
        }
        catch (WebException wex)
        {
            string detail = "";
            try
            {
                if (wex.Response != null)
                {
                    using (StreamReader er = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                        detail = er.ReadToEnd();
                }
            }
            catch { }
            if (detail.Length > 160) detail = detail.Substring(0, 160);
            return "失败：" + wex.Message + (detail.Length > 0 ? " — " + detail : "");
        }
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new AiSettingsForm());
    }
}
