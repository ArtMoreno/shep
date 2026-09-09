# Herdr companion plugin

Install Shep from GitHub Releases, then add its Herdr shortcut:

```sh
herdr plugin install ArtMoreno/shep
```

Open **Plugins → Shep → Open Shep setup** in Herdr. If Shep is not installed, the action opens the downloads page. **Install or update Shep** always opens downloads. Follow the installer, then use Shep setup to connect Tailscale and pair your phone.

The plugin does not silently install software, configure your network, approve terminals, or carry credentials. It launches the desktop app; the bridge keeps running when Herdr’s menu closes.

Windows supports the default per-user or Program Files install location. A custom install can be opened from its desktop shortcut. On macOS, place Shep in Applications. On Linux, install the DEB or put a `shep` launcher for your AppImage on PATH. Linux also needs `xdg-open` for download links.

The public Herdr catalog updates independently of GitHub Releases. A direct plugin install can work before its marketplace listing appears.
