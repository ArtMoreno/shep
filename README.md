<p align="center"><img src="docs/images/shep-logo.png" width="96" alt="Shep logo"></p>
<h1 align="center">Shep</h1>
<p align="center"><strong>Your terminals. Within reach.</strong><br>A phone-friendly companion for Herdr.</p>
<p align="center">Live panes · Agent attention · Windows + SSH · Your own machine</p>

<p align="center"><a href="https://github.com/ArtMoreno/shep/releases">Download desktop preview</a> · <a href="docs/video/shep-demo.mp4">▶ Watch the demo</a> · <a href="#run-locally">Run locally</a> · <a href="#what-to-expect">Current limits</a></p>

---

[![Watch the Shep demo](docs/images/demo-preview.gif)](docs/video/shep-demo.mp4)

## A workspace that goes with you

Check what your agents are doing, open the pane that needs you, and send the next instruction from your phone. Shep connects to your running Herdr session through a local Node bridge.

<table><tr><td><img src="docs/images/sessions.png" width="270" alt="Shep Sessions showing three demo agent panes"></td><td><img src="docs/images/chat.png" width="270" alt="Expanded Codex demo chat"></td><td><img src="docs/images/controls.png" width="270" alt="Expanded session controls"></td></tr><tr><td align="center">See the workspace</td><td align="center">Focus on one pane</td><td align="center">Keep controls close</td></tr></table>

**Demo disclosure:** Screenshots and the video use the real Shep frontend with an isolated, read-only demo backend. Tasks, model labels, statuses, and results are fictional examples, not live agent runs or benchmark results. No personal chats or credentials are shown. The video is a captioned screenshot walkthrough.

## What is inside

- **Live Sessions:** pane layouts, quick switching, minimize/restore, and local names.
- **Terminal access:** direct typing, navigation keys, search, copying, and available history.
- **Agent workflows:** independent sessions, presets, and optional pane orchestration.
- **Attention:** an inbox and Web Push alerts for completion or human attention.
- **More than one computer:** Windows and saved Herdr SSH machines, with separate UI preferences and drafts.
- **Make it yours:** the original lime-and-purple look, Silver macOS, Ghostty-inspired variants, and other built-in themes.
- **Phone input:** reviewed dictation, photo attachments, and hardware keyboard shortcuts where supported.

## Desktop installers (preview)

Shep now includes a desktop setup wizard for Windows, macOS, and Linux. It bundles its Node runtime: users do not need Git, npm, or an AI coding assistant.

1. Download the installer for your computer from **GitHub Releases**, once a preview release is published. CI build artifacts are available to repository collaborators while the repository is private.
2. Install and open Shep. Open Herdr, then choose **Start Shep**.
3. Install Tailscale on the computer and phone, sign into the same account, and choose **Set up phone access**. Enable HTTPS in the Tailscale admin console if prompted.
4. Choose **Create pairing QR**, scan it, and add Shep to the phone's Home Screen. Each code lasts five minutes and is single-use. Pair additional devices separately; revoke them in desktop setup.
5. Optionally enable **Start Shep when I sign in**. Keep the host awake. The tray menu opens setup or quits the bridge.

Shep reserves private HTTPS port 8443 and refuses to replace another application's route. It never enables public Tailscale Funnel. Setup may require a Tailscale permission step; it does not silently elevate or change account access policies. Tailscale enrollment remains a user sign-in step.

Settings, pairing hashes, and push credentials live in Electron's per-user application-data directory, separate from installed files. The installer preserves them during updates/uninstall. Uninstall Tailscale routes separately if you stop using them. No provider credentials ship with the installer.

| Platform | Package | Preview limits |
| --- | --- | --- |
| Windows | Setup EXE, per-user install | Direct terminal mouse helper additionally requires Python |
| macOS 13+ | Intel / Apple Silicon DMG and ZIP | Native keyboard/read bridge; Windows mouse/Neovim helper unavailable |
| Linux | AppImage and DEB | Desktop tray support varies; native keyboard/read bridge; Windows mouse/Neovim helper unavailable |

Preview packages are unsigned. Public distribution needs Windows code signing and macOS signing/notarization. macOS Intel and Apple Silicon need separate matching builds. Linux AppImage updates are supported by the updater; DEB users should install the newer package. Private GitHub repositories use manual downloads: no GitHub credential is bundled into the app. **Check for updates** can use public GitHub release metadata after publication, with explicit download/restart confirmation.

### Build and check installers

```sh
npm ci
npm run test:desktop
npm run test:window
npm run dist -- --publish never
```

Build on the target operating system. For Linux headless window checks use `xvfb-run -a npm run test:window`. The GitHub Actions desktop workflow tests the setup/security logic, opens the setup window with isolated data, and builds native artifacts on Windows, macOS, and Linux. It does not publish a release or change repository visibility.

The window smoke check verifies renderer-to-main IPC and the bundled runtime, and captures a local screenshot. Pairing/route tests use disposable configurations. These checks do not establish real iPhone notification delivery or complete Herdr compatibility on every operating system.

## Run locally

Requirements for source development: Node.js 24+, installed Herdr, and a running Herdr session. The installer bundles Node; the commands below are for developers.

```sh
npm ci
npm test
npm start
```

Open **http://127.0.0.1:4317** on the bridge computer. Phone access requires a private HTTPS route to that computer; localhost on your phone is not your PC. The app has a Home Screen manifest for supported mobile browsers.

Configuration uses `HERDR_MOBILE_SESSION`, `HERDR_MOBILE_WORKSPACE`, `HERDR_MOBILE_BIN`, and `HERDR_MOBILE_PORT`. An explicit workspace limits the bridge scope. Keep private access configuration under ignored `.local/` and use your own credentials and machine settings.

`Start-Mobile.ps1` can supervise the bridge. This backup does not install a scheduled task or copy the original computer's configuration.

### Reproduce the screenshots

```sh
node scripts/demo.mjs
```

Open **http://127.0.0.1:4319**. The demo rejects terminal writes and does not connect to real agents. It uses the same frontend and server rendering path as the app.

## What to expect

This is a private development backup, not a universal compatibility guarantee.

- Agent status and available history depend on Herdr and the underlying TUI. Alternate-screen programs may not retain earlier output.
- SSH sessions currently support reading, launch, and keyboard input. Remote mouse input, file transfers, and teams are not implemented.
- Neovim's phone-fit helper currently targets local Windows Neovim with its default control pipe. Resizing changes the shared desktop editor too; custom socket arrangements may not work.
- iPhone push needs the installed Home Screen app and notification permission. The bridge and remote host must stay reachable. Actual delivery depends on the device and push service.
- Dictation, camera input, and keyboard behavior depend on browser/device support. Desktop browser emulation does not replace physical-device testing.

## Privacy and backup scope

Included: application source, tests, package lock, local assets, required notices, and synthetic demo media.

Excluded: `.local/`, installed dependencies, personal wallpapers, chats, recordings, attachments, worktrees, saved machine addresses, push keys/subscriptions, environment files, logs, and private planning/evidence documents. This is a source backup; restore your own private configuration separately.

## Authorship and notices

Maintained by the repository owner. This repository uses owner-authored commits and GitHub's no-reply email; no assistant co-author credit is added.

Third-party authorship and license notices remain in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), [licenses](licenses), and asset license files. Theme references do not imply affiliation or endorsement. No new license for the original application code is granted by this backup.
