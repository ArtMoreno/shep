# Heeler adaptations

Source: https://github.com/ZingerLittleBee/Heeler

Revision: `3ac42a754aa87d9dc6bff7500d5f7682df7e528e` (Apache License 2.0).
The license is reproduced in `licenses/Heeler-Apache-2.0.txt`. No upstream NOTICE file was present in the reviewed checkout. Original authorship belongs to the Heeler contributors; these adaptations do not imply endorsement.

`public/extras.js` adapts these Swift policies to JavaScript:

- `Sources/Heeler/Snippets/Snippet.swift`: optional title, 4,000-character body limit, newline normalization, control-character rejection.
- `Sources/Heeler/Terminal/TerminalTextSafety.swift`: accepted text controls and CRLF/CR normalization.
- `Sources/Heeler/Terminal/TerminalScreenView.swift`, `TerminalLinkPolicy`: permit ordinary HTTP(S) destinations only. This adaptation additionally rejects embedded credentials.

Browser-specific implementations are informed by `SnippetStore.swift`, `AttachLinkIndex.swift`, and `AttachUserMessageIndex.swift`: preserve unreadable saved catalogs, stable snippet order, per-terminal memory-only links, OSC 8 destination handling, and prompt-glyph history targets.

Changes: browser localStorage instead of UserDefaults; JavaScript UTF-16 length limits; links scan complete bridge snapshots rather than incremental PTY chunks; message jumps navigate loaded xterm rows without sending remote input. No Swift, SSH, ActivityKit or libghostty runtime was copied. Native iOS Live Activities are not provided by these web features.

## JetBrains Mono
Ghostty theme embeds unmodified JetBrains Mono Regular WOFF2 from https://github.com/JetBrains/JetBrainsMono, copyright 2020 The JetBrains Mono Project Authors, under SIL OFL 1.1. Full copyright and license: licenses/JetBrainsMono-OFL.txt. The font is loaded locally only for the Ghostty theme. Ghostty appearance reference: https://ghostty.org/docs/config/reference and ghostty-org/ghostty src/config/Config.zig (default background #282c34, foreground white, transparent macOS titlebar). This is a Herdr web adaptation, not the native Ghostty application.

## Herdr logo

The website uses the unmodified Herdr logo from https://github.com/herdrdev/herdr/blob/master/assets/logo.svg to identify the terminal application Shep connects to. Original artwork belongs to the Herdr contributors; the source repository is licensed under Apache 2.0 (reproduced in licenses/Heeler-Apache-2.0.txt). Herdr is a separate project; this credit does not imply endorsement.
