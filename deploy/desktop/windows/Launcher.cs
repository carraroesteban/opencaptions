// Start OpenCaptions.exe (Windows): opens a console window that runs OpenCaptions (app\scripts\start.js), which
// installs what it needs the first time and opens the dashboard; closing the window stops it. Settings, passwords and
// transcripts live in %LOCALAPPDATA%\OpenCaptions\data, so they survive updates.
// Compiled by the release workflow with the .NET Framework compiler every Windows has:
//   csc /target:winexe /win32icon:..\OpenCaptions.ico /out:"Start OpenCaptions.exe" /r:System.Windows.Forms.dll Launcher.cs
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
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
        if (!OnPath("node.exe"))
        {
            DialogResult r = MessageBox.Show(T(
                "OpenCaptions needs Node.js, a free program.\n\nInstall the LTS version, then open OpenCaptions again.\n\nOpen the download page?",
                "OpenCaptions necesita Node.js, un programa gratuito.\n\nInstalá la versión LTS y volvé a abrir OpenCaptions.\n\n¿Abrir la página de descarga?"),
                "OpenCaptions", MessageBoxButtons.OKCancel, MessageBoxIcon.Information);
            if (r == DialogResult.OK) Process.Start("https://nodejs.org/en/download");
            return 1;
        }
        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenCaptions", "data");
        Directory.CreateDirectory(data);
        var psi = new ProcessStartInfo("cmd.exe", "/c title OpenCaptions && node scripts\\start.js || pause")
        {
            WorkingDirectory = app,
            UseShellExecute = false, // so the environment below reaches it; it still gets its own console window
        };
        psi.EnvironmentVariables["DATA_DIR"] = data;
        psi.EnvironmentVariables["GLOSSARY"] = Path.Combine(data, "glossary.json");
        psi.EnvironmentVariables["SCHEDULE"] = Path.Combine(data, "schedule.json");
        Process.Start(psi);
        return 0;
    }

    static bool OnPath(string exe)
    {
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { if (dir.Trim().Length > 0 && File.Exists(Path.Combine(dir.Trim(), exe))) return true; } catch { }
        }
        return false;
    }
}
