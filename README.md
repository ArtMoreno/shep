<p align="center"><img src="docs/images/shep-logo.png" width="88" alt="Shep logo"></p>
<h1 align="center">Shep</h1>

Open your Herdr terminals from your phone. Read an agent’s response, send the next instruction, or switch to another pane. Your sessions stay on your computer.

[Watch the demo](docs/video/shep-demo.mp4) · [Desktop preview](https://github.com/ArtMoreno/shep/releases) · [Developer setup](docs/DEVELOPMENT.md)

[![Watch Shep in use](docs/images/demo-preview.gif)](docs/video/shep-demo.mp4)

The video starts with a sample-agent walkthrough, then shows three real terminal jobs, theme switching, and QuotaDeck. Opening model output is fictional. The later tests, build checks, and HTTP requests run live. QuotaDeck shows the creator’s approved usage snapshot. The instrumental soundtrack was made for this demo.

<table><tr><td><img src="docs/images/sessions.png" width="260" alt="Sample sessions in the pane grid"></td><td><img src="docs/images/chat.png" width="260" alt="A full-screen sample chat"></td><td><img src="docs/images/controls.png" width="260" alt="The session controls drawer"></td></tr></table>

## Themes and QuotaDeck

Keep the original theme or switch to Ghostty, Matrix, Windows XP, iMessage light/dark, AIM, plain black, macOS, and more. QuotaDeck’s companion pane, strip, and full view are built into the phone UI; usage comes from the desktop QuotaDeck plugin’s saved snapshots. Cached data is labeled.

## Install

[Download the public preview](https://github.com/ArtMoreno/shep/releases/tag/v0.2.0-preview). The installers are unsigned; Windows and macOS may show a warning. You’ll need [Herdr](https://github.com/ogulcancelik/herdr), [Tailscale](https://tailscale.com/download), and a computer that stays awake. Sign in to your agent tools on that computer as usual.

| Computer | Installer |
| --- | --- |
| Windows x64 | Setup EXE |
| Mac with Apple Silicon, macOS 13+ | ARM64 DMG |
| Intel Mac, macOS 13+ | Intel DMG |
| Linux x64 | DEB or AppImage |

1. Install Shep and open Herdr. In Shep, select **Start Shep**. Keep the session name as `default` unless you use another one.
2. Install Tailscale on your computer and phone. Sign in to the same account on both.
3. In Shep, select **Set up phone access**. Follow any HTTPS or Tailscale permission prompt, then retry.
4. Select **Create pairing QR** and scan it with your phone. The code expires after five minutes and can be used once.
5. Add Shep to your Home Screen: **Share → Add to Home Screen** in Safari on iPhone, or **Install app** in Chrome on Android.

You can enable startup at sign-in in desktop setup. Closing the window leaves Shep in the tray; choose **Quit Shep** to stop it. Revoke a paired phone from the device list. On Linux, keep the AppImage in a permanent folder before enabling startup.

## Herdr companion plugin

```sh
herdr plugin install ArtMoreno/shep
```

Use **Open Shep setup** in the plugin actions. It opens the installed app or the downloads page. The plugin does not replace the installer or phone pairing. Requires Herdr 0.9.0+. [Platform notes](plugin/README.md).

## If it won’t connect

- **Herdr isn’t found:** open Herdr, check the session name, or use **Locate Herdr CLI**.
- **Tailscale isn’t connected:** check that both devices are signed in to the same account.
- **HTTPS or permission error:** enable HTTPS in Tailscale and grant the permissions requested by its client. Linux may need an administrator to authorize the Tailscale command.
- **Port 8443 is in use:** Shep leaves the other application’s route alone. Resolve that conflict in Tailscale before retrying.
- **Phone loses connection:** make sure the host is awake and Shep, Herdr, and Tailscale are still running.

## Preview limits

- Windows terminal touch input also needs Python. The terminal mouse and Neovim sizing helpers currently require the Windows bridge.
- SSH supports reading, launching, and keyboard input. Remote mouse input, file transfers, and teams are not implemented.
- Earlier output depends on the terminal app. Some full-screen programs do not retain scrollback.
- iPhone notifications need Home Screen installation and permission. Real phone pairing and push delivery still need device testing.
- Linux tray and AppImage support vary by desktop and distribution. Prefer the DEB on supported Debian/Ubuntu desktops.
- Windows signing and macOS signing/notarization are still needed for a signed release. Preview updates use manual downloads.

Setup/security checks and packaged-window tests passed on Windows, Linux, Intel Mac, and Apple Silicon. The Windows run also passed the 77-test app suite. [See the build results](https://github.com/ArtMoreno/shep/actions/runs/34390985264).

## Help test Shep

Automated builds and smoke checks passed on macOS and Linux, but we still need real-device testing. Try the preview on your setup and [report a bug or contribute a fix](CONTRIBUTING.md). We’ll credit testing and fixes with your permission.

## Privacy

Settings, pairing credentials, uploads, and push subscriptions stay in the local application-data folder. Installers preserve that folder during updates and uninstall. If you stop using Shep, remove its Tailscale route separately.

The repository and installer build exclude local configuration, keys, chats, attachments, logs, personal wallpapers, and worktrees. The website publishes an explicit list of page and demo files. Demo media uses sample tasks. The QuotaDeck screenshot and video include the creator’s real usage figures with permission; no keys or account identifiers are included.

Revoking a phone blocks future terminal requests and push sends to that device. A notification already sent to a push service may still arrive.

Maintained by [ArtMoreno](https://github.com/ArtMoreno). Required third-party notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [licenses](licenses). Original Shep code is available under the [MIT license](LICENSE).
