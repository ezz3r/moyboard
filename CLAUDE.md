# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

moyboard is a lightweight, local-only Windows soundboard built with Tauri 2.
The user picks an output device (typically a virtual cable such as VB-CABLE),
and sounds are played into it so that apps like Discord or games receive them
through the matching virtual microphone. An optional monitor device plays the
same sounds on a second output (e.g. headphones).

Constraints that shape every decision:
- Simple and lightweight: small binary, low idle CPU/RAM, few dependencies.
- Few screens: one main view (categories + pad grid) and one settings view.
- Local only: no accounts, no network access, no telemetry.
- Development happens in WSL/Linux; the deliverable is a Windows `.exe` / NSIS installer.
- Code and comments are in English.

## Stack

- Frontend: React 19, TypeScript (strict), Vite. No UI component library.
  System font stack (no bundled font). Light and dark follow the system; see the visual direction below.
- Backend: Rust, Tauri 2.
  - `cpal` enumerates output devices (WASAPI on Windows).
  - `rodio` (with `symphonia-all`) decodes and plays audio; stable API only
    (`DeviceSinkBuilder`, `Player`), not the `experimental` feature.
  - `tauri-plugin-global-shortcut` for per-sound hotkeys.
  - `tauri-plugin-dialog` for the library folder picker.
  - `notify` watches the library folder.
  - `dirs` resolves the Music folder.
- Tests: Rust unit tests in `moyboard-core`; Playwright UI tests in `e2e/`.

## Repository layout

```
src/                     React frontend
  App.tsx                top bar (category menu, search, icon buttons), pad grid (All view grouped), sidebar, drop handling
  shell.ts               context menu and browser-shortcut guards
  api.ts                 typed wrapper around Tauri invoke(); routes to mock.ts outside Tauri (dev only)
  mock.ts                in-memory backend for browser preview and Playwright (dev only, not in prod bundle)
  types.ts               types mirroring the Rust serde output (camelCase)
  names.ts               stemOf / extOf helpers for file names
  colors.ts              preset colour swatches
  components/
    Pad.tsx              one sound tile: select body, play (another instance), centre stop, headphone preview, hover-only controls
    CategoryMenu.tsx     top-bar category listbox with colour dots and counts; edit and new entries
    QuickPanel.tsx       the Quick Panel window (route by window label; ?view=quick in the browser preview)
    SoundPanel.tsx       sidebar editor for a sound: name (renames file), volume, icon, category, colour, hotkey, trim, delete
    CategoryPanel.tsx    sidebar editor for a category: name, colour, delete
    EmojiField.tsx       icon button and popover; EmojiPicker.tsx (lazy, emoji-mart) is loaded on first open
    HotkeyField.tsx      press-to-record hotkey input
    TrimEditor.tsx       waveform, markers, region preview, save trim / export WAV (inline in the sidebar)
    ConfirmDialog.tsx    modal yes/no (delete)
    Swatches.tsx         colour preset row
    Settings.tsx         library folder, output, monitor and preview devices, folder watching, window, Quick Panel, startup
src-tauri/
  src/lib.rs             Tauri commands, app setup, state wiring, tray, Quick Panel window, autostart
  src/audio.rs           Engine: output streams, per-sound players, monitor, waveform, WAV export
  src/hotkeys.rs         global shortcut registry (shortcut id -> file name; Quick Panel hotkey with Hold/Toggle)
  src/watch.rs           folder watcher, emits `library-changed` (debounced 300 ms)
  crates/moyboard-core/  pure logic, no audio dependency (testable on Linux)
    src/library.rs       list/import/create files, name collision handling, path checks
    src/config.rs        SoundMeta, Config, Store (moyboard.json, atomic writes)
    src/wav.rs           trim_window, wav_header
e2e/app.spec.ts          Playwright UI flows (run against dev server + mock)
docs/MANUAL-TESTS.md     Windows checklist for things automation cannot cover
playwright.config.ts
```

Persistent data:
- Sound files: `<Music>\moyboard` by default (`dirs::audio_dir()`), changeable in settings.
- Metadata: `moyboard.json` in the Tauri app data dir (`%APPDATA%\com.moyboard.app`).
  Keyed by file name. Fields: category, emoji, volume, hotkey, trimStart, trimEnd.
  Written atomically (temp file + rename). A corrupt file is an error, never silently reset.

## Commands

Frontend and app (run from repo root):

```bash
npm install
npm run dev                 # Vite dev server on :1420 (browser preview with mock backend)
npm run build               # tsc + vite build (frontend only)
npm run tauri dev           # full app (needs a Linux display or Windows; audio needs real devices)
```

Rust:

```bash
cargo test --manifest-path src-tauri/crates/moyboard-core/Cargo.toml   # runs on Linux
cargo xwin check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --tests
```

Note: `cargo test` for the `moyboard` crate itself needs `libasound2-dev` (alsa-sys)
on Linux. Without it, verify with the `cargo xwin check ... --tests` command above.

UI tests:

```bash
npm run test:e2e            # starts the dev server on :1420 if not running
```

Windows release build from WSL (the deliverable):

```bash
npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/moyboard.exe` and
`bundle/nsis/moyboard_<version>_x64-setup.exe`.

Prerequisites (WSL): rustup with the `x86_64-pc-windows-msvc` target, `cargo-xwin`,
`nsis`, `lld`, `llvm`, `clang`, Node 22+.

## Architecture notes

- **Commands** are the only frontend-to-backend surface. Add a command in
  `src-tauri/src/lib.rs`, register it in `generate_handler!`, add a wrapper in
  `src/api.ts`, and add a mock case in `src/mock.ts` so the browser preview and e2e keep working.
- **Serde**: Rust structs use `#[serde(rename_all = "camelCase")]`. Keep `src/types.ts` in sync.
  `None` serializes to `null`.
- **Names**: the file name is the display name. Renaming a sound renames the file on disk and moves its metadata key.
- **Path safety**: every file name from the frontend goes through `library::check_file_name`
  (no separators, no `..`). Do not join unchecked input onto the library path.
- **Audio**: each sound gets its own `Player` per output, so sounds overlap. Trim is applied
  with `skip_duration` / `take_duration`. Monitor output decodes the file a second time.
  Gains are clamped to 0..=2.
- **Hotkeys**: `hotkeys::sync` unregisters everything and re-registers from config. It runs after
  every metadata, rename, forget change, and at startup. `set_sound_meta` rolls back the saved
  metadata if a hotkey cannot be registered.
- **Waveform**: streamed decode at 100 peaks per second (`audio::PEAKS_PER_SEC`).
- **Trim**: stored as non-destructive metadata. "Save as new file" writes a 16-bit PCM WAV via a
  streaming writer. Full-range trims are stored as `null`.
- **Quick Panel**: a second window (label `quick-panel`), created hidden, frameless, always on top, not focusable. Its hotkey is registered by `hotkeys::sync` after the sounds, so a clash shows up as a registration error. Position and size are saved from the page after a move settles and clamped on show (`config::clamp_geometry`). Shown without focus, so search typing may not reach it on Windows (see `docs/MANUAL-TESTS.md`).
- **Tray and window**: close hides the main window unless "Close to tray" is off. Single instance focuses the running window. Autostart passes `--minimized`; the "Start minimized" setting decides whether that flag hides the window at start.
- **Watcher**: non-recursive `notify` watch on the library folder; events are debounced and
  emitted as `library-changed`, which the frontend handles by rescanning.
- **Change events**: commands that change the library or metadata call `notify_changed`, which emits `library-changed` to every window, so the Quick Panel refreshes.
- **Dev-only mock**: `src/api.ts` imports `src/mock.ts` only when `import.meta.env.DEV` and not inside Tauri.
  Do not import the mock from production code paths.

## Conventions

- Keep changes minimal. Reuse existing helpers (`current_dir`, `sound_path`, `lock`,
  `library::create_unique`, `trim_window`) before adding new ones.
- Pure logic goes into `moyboard-core` if it does not need audio or Tauri types. That keeps it testable on Linux.
- New non-trivial logic should come with a test: a Rust unit test in `moyboard-core`, or a Playwright case in `e2e/app.spec.ts`.
- Errors from commands are `Result<T, String>` with a short, specific message. The UI shows them
  in the toast. Do not swallow errors silently; log with `eprintln!` only at startup.
- No new runtime dependency for a few lines of code.
- Accessibility: keep `aria-label`s on icon-only buttons, keyboard access on sliders (role="slider")
  and focus-visible outlines. Respect `prefers-reduced-motion`.
- Visual direction: Apple-like and quiet. Light by default, dark when the system is dark
  (`data-theme="dark"` forces it). One accent, blue (`--accent`), for focus, selection and primary
  actions; red (`--alarm`) only for destructive or missing. No gradients. One soft shadow
  (`--elevation`) on floating surfaces only (menus, dialogs, emoji popover). Small radii.
  Tokens live in `:root` and in the two dark blocks in `src/styles.css`; keep those in sync.
  Text 4.5:1 and control borders 3:1 against their background.
- Commit messages: imperative summary line, body explaining the why. Commit after each finished unit of work.

## Verification checklist before committing

1. `npm run build` passes (tsc is strict; `noUnusedLocals` is on).
2. `cargo test --manifest-path src-tauri/crates/moyboard-core/Cargo.toml` passes.
3. `cargo xwin check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --tests` passes with no warnings.
4. `npm run test:e2e` passes (49 tests at time of writing).
5. For UI changes: look at the result (Playwright screenshot or `npm run dev`) at desktop width and at 420 px.
6. For Windows-specific behavior (audio routing, global hotkeys, OS drag-and-drop, watcher, folder picker):
   say clearly that it was not run, and add or update the relevant item in `docs/MANUAL-TESTS.md`.

## Known gaps and limits

- Not yet verified on a real Windows machine with a real virtual cable (see `docs/MANUAL-TESTS.md`).
- Host (Linux) `cargo test` for the `moyboard` crate needs ALSA headers; `moyboard-core` tests do not.
- Playwright tests use the browser mock. They do not cover Tauri IPC, audio, hotkeys, tray, autostart, window move/resize, or OS drag-and-drop.
- Quick Panel and tray behaviour (focus, hold/toggle, monitor clamping, Run entry) is unverified on Windows.
- Emoji rendering depends on the OS emoji font (Segoe UI Emoji on Windows).
- The app is unsigned. Installer signing works only on a Windows host.
- The bundle identifier `com.moyboard.app` ends in `.app`; Tauri warns about it. Changing it moves
  the app data directory, so do it before any real user config exists.

## Things to avoid

- Do not add network calls, telemetry, or accounts. The app is local-only by design.
- Do not use the `rodio` `experimental` feature (`speakers` module).
- Do not write user files outside the library folder. Trim export and import both stay inside it.
- Do not delete or overwrite a user's sound file without an explicit user action.
- Do not kill processes or change system state from scripts without asking.
