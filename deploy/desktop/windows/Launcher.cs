// Start OpenCaptions.exe (Windows): opens a console window that runs OpenCaptions (app\scripts\start.js), which
// installs what it needs the first time and opens the dashboard; closing the window stops it. While it runs, an icon
// in the taskbar's notification area opens the dashboard and has "Check for Updates…". Settings, passwords and
// transcripts live in %LOCALAPPDATA%\OpenCaptions\data, so they survive updates. No Node.js on this computer (or one
// without the October 2026 security fixes, see src\node-version.js): the official one is downloaded into
// %LOCALAPPDATA%\OpenCaptions\node, and downloaded again when that copy is too old.
// Compiled by the release workflow with the .NET Framework compiler every Windows has:
//   csc /target:winexe /win32icon:..\OpenCaptions.ico /out:"Start OpenCaptions.exe" /r:System.Windows.Forms.dll
//       /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll
//       /r:System.IO.Compression.FileSystem.dll Launcher.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("OpenCaptions")]
[assembly: AssemblyProduct("OpenCaptions")]
[assembly: AssemblyDescription("Live captions and translation for every event")]
[assembly: AssemblyCopyright("MIT License")]

static class Launcher
{
    static readonly bool Es = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es";
    static string T(string en, string es) { return Es ? es : en; }
    // This launcher's version, for OC_SHELL (src/updates.js): raise it with deploy\desktop\shell.json when a change here
    // can't arrive through the in-app update, so people are told to download the app once.
    const string ShellVersion = "1";

    [STAThread]
    static int Main()
    {
        string here = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(here, "app");
        if (!File.Exists(Path.Combine(app, "package.json")))
        {
            // Opened from inside the ZIP: Windows extracted only this file to a temporary folder.
            MessageBox.Show(T(
                "Extract the ZIP first: right-click it, choose \"Extract All\", then open \"Start OpenCaptions\" in the extracted folder.",
                "Primero descomprimí el ZIP: clic derecho, \"Extraer todo\", y abrí \"Start OpenCaptions\" en la carpeta extraída."),
                "OpenCaptions", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
        string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenCaptions");
        string nodeDir = Path.Combine(home, "node");
        string check = Path.Combine(app, "src", "node-version.js");
        string node = NodeOk(Which("node.exe"), check) ? null : NodeOk(Path.Combine(nodeDir, "node.exe"), check) ? nodeDir : GetNode(nodeDir);
        if (node != null && node != "" && !NodeOk(Path.Combine(node, "node.exe"), check)) node = "";
        if (node == "")
        {
            DialogResult r = MessageBox.Show(T(
                "OpenCaptions couldn't download Node.js, a free program it needs. Check the internet connection and open OpenCaptions again, or install Node.js yourself (the LTS version).\n\nOpen the download page?",
                "OpenCaptions no pudo descargar Node.js, un programa gratuito que necesita. Revisá la conexión a internet y volvé a abrir OpenCaptions, o instalá Node.js vos (la versión LTS).\n\n¿Abrir la página de descarga?"),
                "OpenCaptions", MessageBoxButtons.OKCancel, MessageBoxIcon.Information);
            if (r == DialogResult.OK) Process.Start("https://nodejs.org/en/download");
            return 1;
        }
        string data = Path.Combine(home, "data");
        Directory.CreateDirectory(data);
        var psi = new ProcessStartInfo("cmd.exe", "/c title OpenCaptions && node scripts\\start.js || pause")
        {
            WorkingDirectory = app,
            UseShellExecute = false, // so the environment below reaches it; it still gets its own console window
        };
        if (node != null) psi.EnvironmentVariables["PATH"] = node + ";" + psi.EnvironmentVariables["PATH"];
        psi.EnvironmentVariables["DATA_DIR"] = data;
        psi.EnvironmentVariables["LOCAL_DIR"] = Path.Combine(home, "local"); // the free local AI's downloads survive updates
        psi.EnvironmentVariables["GLOSSARY"] = Path.Combine(data, "glossary.json");
        psi.EnvironmentVariables["SCHEDULE"] = Path.Combine(data, "schedule.json");
        psi.EnvironmentVariables["OC_SHELL"] = ShellVersion;
        Tray(Process.Start(psi), app);
        return 0;
    }

    // ---------------------------------------------------------------- the icon, while OpenCaptions runs

    static NotifyIcon tray;

    static void Tray(Process run, string app)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(T("Open Dashboard", "Abrir el panel"), null, delegate { OpenDashboard(app); });
        menu.Items.Add(T("Check for Updates…", "Buscar actualizaciones…"), null, delegate { InBackground(delegate { CheckForUpdates(app); }); });
        tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = "OpenCaptions", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { OpenDashboard(app); };
        // The console window closed: OpenCaptions stopped, and so does the icon.
        var poll = new System.Windows.Forms.Timer { Interval = 2000 };
        poll.Tick += delegate { if (run.HasExited) { tray.Visible = false; Application.Exit(); } };
        poll.Start();
        Application.Run();
    }

    static void InBackground(ThreadStart work)
    {
        var t = new Thread(work) { IsBackground = true };
        t.SetApartmentState(ApartmentState.STA); // message boxes
        t.Start();
    }

    /// <summary>
    /// The running OpenCaptions' address: the port start.js uses (PORT, or app\.env's, else 8080), or one of the next
    /// 20 when that one was taken (start.js moves over the same way).
    /// </summary>
    static string Base(string app)
    {
        string env = Path.Combine(app, ".env");
        Match m = File.Exists(env) ? Regex.Match(File.ReadAllText(env), @"^PORT=(\d+)", RegexOptions.Multiline) : Match.Empty;
        int port;
        if (!int.TryParse(Environment.GetEnvironmentVariable("PORT") ?? (m.Success ? m.Groups[1].Value : "8080"), out port)) port = 8080;
        for (int p = port; p <= port + 20; p++)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://localhost:" + p + "/healthz");
                req.Timeout = 800;
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var r = new StreamReader(res.GetResponseStream()))
                    if (r.ReadToEnd().Contains("\"ok\":true")) return "http://localhost:" + p + "/";
            }
            catch { }
        }
        return null;
    }

    static void OpenDashboard(string app)
    {
        string b = Base(app);
        if (b != null) Process.Start(b + "admin.html");
    }

    /// <summary>POST to the running OpenCaptions; from this computer it needs no password (AUTH=auto). Throws with its error.</summary>
    static Dictionary<string, object> Post(string url)
    {
        var json = new JavaScriptSerializer();
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentLength = 0;
            req.Timeout = 300000; // the update's download
            using (var res = req.GetResponse())
            using (var r = new StreamReader(res.GetResponseStream()))
                return json.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
        }
        catch (WebException e)
        {
            string error = e.Message;
            try
            {
                using (var r = new StreamReader(e.Response.GetResponseStream()))
                    error = (string)json.Deserialize<Dictionary<string, object>>(r.ReadToEnd())["error"];
            }
            catch { }
            throw new Exception(error);
        }
    }

    static string Str(Dictionary<string, object> d, string key) { object v; return d != null && d.TryGetValue(key, out v) && v != null ? v.ToString() : ""; }

    static void CheckForUpdates(string app)
    {
        const string title = "OpenCaptions";
        string b = Base(app);
        if (b == null) { MessageBox.Show(T("OpenCaptions isn't running yet.", "OpenCaptions todavía no está funcionando."), title); return; }
        Dictionary<string, object> res;
        try { res = Post(b + "api/updates/check"); }
        catch (Exception e)
        {
            // Signed-in setups (AUTH not auto): the dashboard shows the same update and can sign in.
            if (MessageBox.Show(T("Couldn't check for updates: ", "No se pudo buscar actualizaciones: ") + e.Message + "\n\n" + T("Open the dashboard?", "¿Abrir el panel?"), title, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes) Process.Start(b + "admin.html");
            return;
        }
        string current = Str(res, "current");
        var up = res.ContainsKey("update") ? res["update"] as Dictionary<string, object> : null;
        if (up == null)
        {
            MessageBox.Show(T("You're up to date: OpenCaptions " + current + " is the latest version.", "Tenés la última versión: OpenCaptions " + current + " es la más reciente."), title, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        string version = Str(up, "version"), notes = Str(up, "whatsNew"), appUrl = Str(up, "app"), download = appUrl != "" ? appUrl : Str(up, "download");
        bool canUpdate = Str(up, "canUpdate") == "True";
        int live; int.TryParse(Str(res, "live"), out live);
        if (notes.Length > 1200) notes = notes.Substring(0, 1200) + "…"; // a message box doesn't scroll; the dashboard has them all
        string text = T("OpenCaptions " + version + " is available (you have " + current + ").", "OpenCaptions " + version + " ya está disponible (tenés la " + current + ").")
            + (notes != "" ? "\n\n" + T("What's new:", "Novedades:") + "\n" + notes : "");
        if (!canUpdate)
        {
            if (MessageBox.Show(text + "\n\n" + T("Download it now?", "¿Descargarla ahora?"), title, MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes && download != "") Process.Start(download);
            return;
        }
        text += "\n\n" + T("Update and restart now? Captions pause for about a minute", "¿Actualizar y reiniciar ahora? Los subtítulos se pausan cerca de un minuto")
            + (live > 0 ? T(" in " + live + " live room(s).", " en " + live + " sala(s) en vivo.") : ".")
            + (appUrl != "" ? "\n\n" + T("This version also improves the launcher itself: after updating, download the app once and replace this folder's \"Start OpenCaptions\".", "Esta versión también mejora el lanzador: después de actualizar, descargá la app una vez y reemplazá el \"Start OpenCaptions\" de esta carpeta.") : "");
        if (MessageBox.Show(text, title, MessageBoxButtons.YesNo, MessageBoxIcon.Information) != DialogResult.Yes) return;
        tray.ShowBalloonTip(5000, title, T("Updating to " + version + "… OpenCaptions restarts in its window.", "Actualizando a la " + version + "… OpenCaptions se reinicia en su ventana."), ToolTipIcon.Info);
        try { Post(b + "api/update"); }
        catch (Exception e) { MessageBox.Show(e.Message, title, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (appUrl != "") Process.Start(appUrl);
    }

    static string Which(string exe)
    {
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { if (dir.Trim().Length > 0 && File.Exists(Path.Combine(dir.Trim(), exe))) return Path.Combine(dir.Trim(), exe); } catch { }
        }
        return null;
    }

    /// <summary>A Node.js with the security fixes OpenCaptions requires at this path: check (src\node-version.js) prints "ok".</summary>
    static bool NodeOk(string exe, string check)
    {
        if (exe == null || !File.Exists(exe)) return false;
        try
        {
            var p = Process.Start(new ProcessStartInfo(exe, "\"" + check + "\"") { UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true });
            string answer = p.StandardOutput.ReadToEnd().Trim();
            p.WaitForExit();
            return answer == "ok";
        }
        catch { return false; }
    }

    /// <summary>
    /// The official Node.js for this computer, checked against nodejs.org's published checksums, unpacked into dest.
    /// Returns dest, or "" when it couldn't. shortcut: always the newest Node 22 (22.23.4 or later has the fixes); move
    /// to the next LTS line before 22's end of life.
    /// </summary>
    static string GetNode(string dest)
    {
        const string dist = "https://nodejs.org/dist/latest-v22.x/";
        string arch = (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432") ?? Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "") == "ARM64" ? "arm64" : "x64";
        var wait = new Form { Text = "OpenCaptions", Width = 460, Height = 120, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, ControlBox = false };
        wait.Controls.Add(new Label { Text = T("Downloading Node.js (about 30 MB, first time only)…", "Descargando Node.js (unos 30 MB, solo la primera vez)…"), Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter });
        wait.Show();
        wait.Refresh();
        string tmp = Path.Combine(Path.GetTempPath(), "opencaptions-node-" + Guid.NewGuid().ToString("N"));
        try
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2: .NET 4's default is older
            using (var web = new WebClient())
            {
                string name = null, hash = null;
                foreach (string line in web.DownloadString(dist + "SHASUMS256.txt").Split('\n'))
                {
                    string l = line.Trim();
                    if (l.EndsWith("-win-" + arch + ".zip") && l.Length > 66) { hash = l.Substring(0, 64); name = l.Substring(64).Trim(); }
                }
                if (name == null) return "";
                Directory.CreateDirectory(tmp);
                string zip = Path.Combine(tmp, name);
                web.DownloadFile(dist + name, zip);
                using (var sha = SHA256.Create())
                using (var f = File.OpenRead(zip))
                {
                    if (BitConverter.ToString(sha.ComputeHash(f)).Replace("-", "").ToLowerInvariant() != hash) return "";
                }
                ZipFile.ExtractToDirectory(zip, tmp);
                if (Directory.Exists(dest)) Directory.Delete(dest, true);
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                Directory.Move(Path.Combine(tmp, name.Substring(0, name.Length - 4)), dest);
                return dest;
            }
        }
        catch { return ""; }
        finally
        {
            wait.Close();
            try { Directory.Delete(tmp, true); } catch { }
        }
    }
}
