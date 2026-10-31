# Manual test checklist (Windows)

Automated coverage: `npm run test:e2e` (UI flows, browser mock) and
`cargo test --manifest-path src-tauri/crates/moyboard-core/Cargo.toml` (library,
metadata, trim math, WAV header). Everything below needs the real app on Windows.

Setup: install VB-CABLE (or another virtual cable), then run
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/moyboard_*_x64-setup.exe`.

## Startup and library
- [ ] First start creates `Music\moyboard` if missing.
- [ ] Existing files in that folder show as pads.
- [ ] Deleting a file in Explorer shows the pad as missing after a moment (folder watcher).
- [ ] Settings → Folder watching off: the same deletion does not refresh until Rescan.
- [ ] Settings → Change folder: pick another folder, pads reload from it.

## Import
- [ ] Drag mp3, wav, ogg, flac from Explorer onto the window: overlay shows, files copied (originals untouched).
- [ ] Dropping a file with the same name adds `name (1).ext`.
- [ ] Dropping a .txt shows an error toast and imports nothing from it.
- [ ] With a category selected, dropped files join that category.

## Playback and devices
- [ ] Output device list shows all WASAPI outputs with (default) marked.
- [ ] Pick the virtual cable; play a pad; Discord (input = CABLE Output) hears it.
- [ ] Two sounds at once overlap.
- [ ] Stop all stops everything.
- [ ] Master volume and per-sound volume change loudness.
- [ ] Monitor set to headphones: sound plays on both outputs; monitor volume changes only the headphones.
- [ ] Monitor = primary is rejected with an error.
- [ ] Unplug the saved output device, restart: app starts, play uses default output, no crash.

## Hotkeys
- [ ] Record Ctrl+Shift+Digit1 on a sound, click into another app, press it: sound plays.
- [ ] Hotkey already used by another app: save is rejected, error shown, previous hotkey restored.
- [ ] Clear removes the hotkey; pressing it does nothing.
- [ ] Hotkey on a sound that is later renamed still works.

## Trim
- [ ] Trim editor waveform matches the audio.
- [ ] Play region plays only the selected part.
- [ ] Save trim: pad plays trimmed; original file unchanged.
- [ ] Save as new file: new WAV opens in a media player with the same region.
- [ ] Trimming a 10-minute file opens without a long freeze (waveform streaming).

## Edit and categories
- [ ] Rename renames the file in Explorer.
- [ ] Rename to an existing name shows an error; no file is overwritten.
- [ ] Case-only rename (`Airhorn` → `airhorn`) works.
- [ ] Settings → rename category updates every sound.

## Robustness
- [ ] Corrupt `%APPDATA%\com.moyboard.app\moyboard.json`: app shows an error at startup and does not overwrite the file.
- [ ] Remove the library folder while running: Rescan shows an error, app stays responsive.
- [ ] Idle CPU near zero; memory stays low with the window open for 10 minutes.
