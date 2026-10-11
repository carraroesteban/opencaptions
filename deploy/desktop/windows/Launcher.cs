// Start OpenCaptions.exe (Windows): opens a console window that runs OpenCaptions (app\scripts\start.js), which
// installs what it needs the first time and opens the dashboard; closing the window stops it. Settings, passwords and
// transcripts live in %LOCALAPPDATA%\OpenCaptions\data, so they survive updates. No Node.js on this computer (or older
// than 20): the official one is downloaded once into %LOCALAPPDATA%\OpenCaptions\node.
// Compiled by the release workflow with the .NET Framework compiler every Windows has:
//   csc /target:winexe /win32icon:..\OpenCaptions.ico /out:"Start OpenCaptions.exe" /r:System.Windows.Forms.dll
//       /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll Launcher.cs
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("OpenCaptions")]
[assembly: AssemblyProduct("OpenCaptions")]
[assembly: AssemblyDescription("Live captions and translation for every event")]
[assembly: AssemblyCopyright("MIT License")]

static class Launcher
{
    static readonly bool Es = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es";
    static string T(string en, string es) { return Es ? es : en; }

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
        string node = NodeOk(Which("node.exe")) ? null : NodeOk(Path.Combine(nodeDir, "node.exe")) ? nodeDir : GetNode(nodeDir);
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
        psi.EnvironmentVariables["GLOSSARY"] = Path.Combine(data, "glossary.json");
        psi.EnvironmentVariables["SCHEDULE"] = Path.Combine(data, "schedule.json");
        Process.Start(psi);
        return 0;
    }

    static string Which(string exe)
    {
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { if (dir.Trim().Length > 0 && File.Exists(Path.Combine(dir.Trim(), exe))) return Path.Combine(dir.Trim(), exe); } catch { }
        }
        return null;
    }

    /// <summary>Node.js 20 or newer at this path.</summary>
    static bool NodeOk(string exe)
    {
        if (exe == null || !File.Exists(exe)) return false;
        try
        {
            var p = Process.Start(new ProcessStartInfo(exe, "-p process.versions.node.split('.')[0]") { UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true });
            string major = p.StandardOutput.ReadToEnd().Trim();
            p.WaitForExit();
            int n;
            return int.TryParse(major, out n) && n >= 20;
        }
        catch { return false; }
    }

    /// <summary>
    /// The official Node.js for this computer, checked against nodejs.org's published checksums, unpacked into dest.
    /// Returns dest, or "" when it couldn't. shortcut: always the newest Node 22; move to the next LTS line when
    /// package.json's engines does.
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
