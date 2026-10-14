# 0011. A Mac app and a Windows launcher that run the same server

- Status: Accepted
- Date: 2026-10-04

## Context

Organizers who don't use a terminal needed a way to start OpenCaptions. A first version shipped double-click scripts (`.command`, `.bat`) in the repository's root: they worked, but had no icon, sat among developer files, and the repository ZIP looked like source code, not an app. Code signing (Apple Developer ID, a Windows certificate) costs money every year; without it, both systems warn on the first launch. macOS also runs unsigned downloaded apps from a random read-only place ("App Translocation"), so an app can't rely on files next to it or install anything beside itself.

## Options considered

1. Keep the scripts and point people at the repository ZIP.
2. A single executable per platform with Node bundled (Node SEA, pkg).
3. Thin launchers with the logo that run the normal server with the user's Node.js: an `.app` bundle on macOS, a small compiled `.exe` on Windows, built and attached to every release.
4. Package managers only (Homebrew, winget, npm).

## Decision

Option 3. The Mac app carries the app files inside the bundle, copies them to `~/Library/Application Support/OpenCaptions/app-<version>` on first launch (which works under translocation and gives a writable place for the libraries), and opens a Terminal window running `scripts/start.js`. The Windows launcher is a few lines of C# compiled on Windows in CI with the logo as its icon; it runs the starter in a console next to an `app` folder, and explains what to do when it's opened from inside the ZIP. Both keep data outside the app (`.../OpenCaptions/data`, `%LOCALAPPDATA%\OpenCaptions\data`), so updates keep it. They need Node.js 20+: if the computer doesn't have it, they download the official one from nodejs.org once (checked against its published checksums) into `.../OpenCaptions/node`, and only send people to nodejs.org when that fails. The Mac app's program is a small universal C executable (`launcher.c`, compiled on a Mac in CI) that runs the launcher script: macOS asks Apple-chip Macs to install Rosetta for an app whose program is a script.

## Consequences

- Good: two clean downloads (`OpenCaptions-mac.zip`, `OpenCaptions-windows.zip`) with one icon each and a "Read me"; the repository root stays a normal project.
- Good: the launchers run exactly what developers run (`npm run app`), so there's one code path to test.
- Bad: Node.js is a separate install, and the first launch shows the systems' warning for unsigned apps. Signing is on the roadmap.
- Bad: the libraries install on the first start, which needs internet once (they include a platform-specific ffmpeg, so they can't be bundled for every Mac).
- Follow-ups: CI compiles the launcher and packages both downloads on every push, so a broken launcher shows up before a release.

## Update (2026-10-14): a native window instead of Terminal

The Mac app's program is now a small AppKit window (`deploy/desktop/macos/OpenCaptions.swift`) instead of `launcher.c` opening Terminal. It runs the same launcher script and `scripts/start.js` and shows their progress (starting, installing the first time, running), with **Open Dashboard**, the output under **Details**, and a confirmation before **Quit** stops the captions. It removes the "control Terminal" permission prompt (declining it used to make the app do nothing), and macOS's own prompts now name OpenCaptions. The window holds the other end of the starter's stdin, so the server stops with the app however it ends (quit, force quit, a crash). Current Swift toolchains link Intel builds for macOS 13 or later only, so Intel Macs need macOS 13 (`LSMinimumSystemVersionByArchitecture`); Apple-chip Macs keep macOS 11.
