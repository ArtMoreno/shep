# Development

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

`Start-Mobile.ps1` can supervise the bridge. Source setup does not install a scheduled task or copy another computer's configuration.

### Reproduce the screenshots

```sh
node scripts/demo.mjs
```

Open **http://127.0.0.1:4319**. The demo rejects terminal writes and does not connect to real agents. It uses the same frontend and server rendering path as the app.

## What to expect

This is preview software. Platform support still needs real-device testing.

- Agent status and available history depend on Herdr and the underlying TUI. Alternate-screen programs may not retain earlier output.
- SSH sessions currently support reading, launch, and keyboard input. Remote mouse input, file transfers, and teams are not implemented.
- Neovim's phone-fit helper currently targets local Windows Neovim with its default control pipe. Resizing changes the shared desktop editor too; custom socket arrangements may not work.
- iPhone push needs the installed Home Screen app and notification permission. The bridge and remote host must stay reachable. Actual delivery depends on the device and push service.
- Dictation, camera input, and keyboard behavior depend on browser/device support. Desktop browser emulation does not replace physical-device testing.

