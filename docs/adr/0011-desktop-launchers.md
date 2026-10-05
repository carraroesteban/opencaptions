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

Option 3. The Mac app carries the app files inside the bundle, copies them to `~/Library/Application Support/OpenCaptions/app-<version>` on first launch (which works under translocation and gives a writable place for the libraries), and opens a Terminal window running `scripts/start.js`. The Windows launcher is a few lines of C# compiled on Windows in CI with the logo as its icon; it runs the starter in a console next to an `app` folder, and explains what to do when it's opened from inside the ZIP. Both keep data outside the app (`.../OpenCaptions/data`, `%LOCALAPPDATA%\OpenCaptions\data`), so updates keep it. They need Node.js 20+, and send people to nodejs.org if it's missing.

## Consequences

- Good: two clean downloads (`OpenCaptions-mac.zip`, `OpenCaptions-windows.zip`) with one icon each and a "Read me"; the repository root stays a normal project.
- Good: the launchers run exactly what developers run (`npm run app`), so there's one code path to test.
- Bad: Node.js is a separate install, and the first launch shows the systems' warning for unsigned apps. Signing is on the roadmap.
- Bad: the libraries install on the first start, which needs internet once (they include a platform-specific ffmpeg, so they can't be bundled for every Mac).
- Follow-ups: CI compiles the launcher and packages both downloads on every push, so a broken launcher shows up before a release.
