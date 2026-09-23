# Doodle

A recursively zoomable creative document: a book, a film or a set of pictures as a field of cards you can pan, zoom, wire and run — and enter, all the way down to the page you write on. Built on [The Soft Machine](https://github.com/x0bd/v00v).

## Install

For Apple Silicon Macs, macOS 13 or later.

1. Download the `.dmg` from the newest [Release](https://github.com/x0bd/doodle/releases).
2. Open it and drag **Doodle** to **Applications**.
3. Open Doodle. The first time, macOS stops it: this build is not notarized by Apple. Go to **System Settings → Privacy & Security**, scroll to *"Doodle" was blocked to protect your Mac*, and choose **Open Anyway**. You only do this once per version.

   Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/Doodle.app`

What it can use, all optional — without any of them it runs on a built-in stand-in:

- **ChatGPT**, through the [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex@latest`, then `codex login`.
- **Ollama**, models on your own Mac: install from [ollama.com](https://ollama.com), then `ollama pull qwen3:14b`.

*Settings → Providers* says what it found, and what to do about what it didn't.

A project is a `Name.doodle` package: one file in the Finder, double-click to open.

## Build

Vite + React + TypeScript, Tauri 2. `pnpm install && pnpm tauri dev`; `pnpm release` makes `Doodle.app` and the `.dmg` in `src-tauri/target/release/bundle/`. A tag `vX.Y.Z` pushed to GitHub builds a draft Release. See `HANDOFF.md` and `PLAN.md`.
