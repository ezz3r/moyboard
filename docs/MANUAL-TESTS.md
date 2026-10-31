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
- [ ] Sidebar → category name: renaming updates the rail and every pad in it; sounds keep their category.
- [ ] Deleting a category moves its sounds to Uncategorized; the files stay in Explorer.
- [ ] Emoji picker opens offline; searching "fire" finds 🔥 and shows the emoji with the system font.

## Pads, preview and sidebar (v2)
- [ ] Clicking a pad body selects it and does not play.
- [ ] Play button turns into Stop while the sound plays; Stop stops only that sound.
- [ ] Headphone button plays only on the Settings → Preview output device; the virtual cable hears nothing.
- [ ] Headphone Stop stops the preview but leaves the same sound playing on the main output.
- [ ] Preview output set to the same device as the main output: preview is refused with an error.
- [ ] A sound that ends on its own flips its Stop button back to Play without a click.
- [ ] Hotkey starts a playing sound; the same hotkey stops it.
- [ ] Trim "Play region" plays on the preview device, not on the cable.

## Delete (v2)
- [ ] Delete sound → confirm → file appears in the Recycle Bin, not permanently gone.
- [ ] Delete key with a pad selected opens the confirmation; Escape cancels.
- [ ] After delete, Rescan and folder watching do not bring the pad back.
- [ ] Deleting a playing sound stops it.
- [ ] Deleting a sound whose hotkey was set: the hotkey no longer fires.
- [ ] A locked file (open in another program) shows an error; metadata is kept.

## Colours and icons (v2)
- [ ] Category colour shows as a stripe on every pad in that category; a sound colour overrides it.
- [ ] Clearing a sound colour returns it to the category colour.

## Windows-only items not run in WSL
The v2 playback routing (preview device, Stop per sound, playback events),
global hotkey toggling, Recycle Bin delete and the Windows installer were not
run on a Windows machine when this list was written. Check every item above
before a release.

## Robustness
- [ ] Corrupt `%APPDATA%\com.moyboard.app\moyboard.json`: app shows an error at startup and does not overwrite the file.
- [ ] Remove the library folder while running: Rescan shows an error, app stays responsive.
- [ ] Idle CPU near zero; memory stays low with the window open for 10 minutes.
