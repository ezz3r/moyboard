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
- [ ] Top bar category menu: renaming a category (Edit button → sidebar) updates the menu and every pad in it; sounds keep their category.
- [ ] Edit button is disabled for All and Uncategorized; for a category it opens that category's editor.
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

## Multi-instance and pads (v3)
- [ ] Pressing Play on a playing sound starts another copy; the pad shows `x2`, and the count drops as each copy ends.
- [ ] The centre Stop appears while a sound plays and stops every copy of it; other sounds keep playing.
- [ ] Play, Preview and Stop buttons on a pad are always visible; Stop appears only while the sound plays.

## Tray and window (v3)
- [ ] Closing the main window hides it; sounds and hotkeys keep working; the tray icon stays.
- [ ] Tray left-click toggles the main window.
- [ ] Tray menu: Open moyboard, Quick Panel, Stop all sounds, Quit. Quit exits the process (check Task Manager).
- [ ] Settings → Close to tray off: closing the window quits the app.
- [ ] Launching moyboard a second time focuses the running window; no second tray icon appears.

## Quick Panel (v3)
- [ ] Hotkey (Toggle mode) shows the panel; the same hotkey hides it; Esc hides it.
- [ ] Hold mode: the panel shows while the key is down and hides on release. Auto-repeat does not flicker it.
- [ ] Showing the panel does not take focus from the game or app in front (type in Notepad before and after).
- [ ] Works over a windowed or borderless game. Note the result for exclusive fullscreen (expected: not visible).
- [ ] Typing in the panel's search box: check whether keys reach it while the panel is shown without focus. If not, record it as a known limit.
- [ ] Drag the grip to move; drag the corner to resize; the window stays within its minimum size.
- [ ] Move and resize, hide, show again: the position and size are restored.
- [ ] Move the panel onto a second monitor, unplug that monitor, show the panel: it appears on the remaining screen.
- [ ] Settings → Reset panel position and size: the panel is back at its default size, centred.
- [ ] Play a sound from the panel: the same sound shows as playing in the main window, and vice versa.
- [ ] Add or rename a sound in the main window while the panel is hidden: the panel shows the change when opened.
- [ ] A Quick Panel hotkey that a sound already uses is refused with a message; the previous hotkey is kept.

## Startup (v3)
- [ ] Settings → Start moyboard with Windows on: a `moyboard` entry appears under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- [ ] Settings → Start with Windows off: the entry is removed.
- [ ] Remove the Run entry in Regedit, reopen Settings: the checkbox shows off.
- [ ] Start minimized on, start with Windows on, sign out and in: no window appears; tray icon is present.
- [ ] Start minimized off, start with Windows on: the window appears at sign-in.
- [ ] Launching by hand (no `--minimized`) always shows the window, even with minimized start on.

## Quick Panel hotkeys (v4)
Run on the Windows build. Debug builds print `moyboard: quick panel key Pressed/Released` to the console; release builds print nothing, so use a debug build to diagnose a failure.
- [ ] Quick Panel hotkey `Ctrl+Backquote` (Toggle): each press opens and closes the panel.
- [ ] Same hotkey in Hold mode: panel shows while held, hides on release; holding does not flicker.
- [ ] `Ctrl+Shift+<letter>` and `Alt+<letter>` work in Toggle and Hold.
- [ ] A single key (e.g. `PageDown`) still works in both modes.
- [ ] Change the Quick Panel hotkey without restarting: the new one works, the old one does not.
- [ ] Restart the app: the saved hotkey works.
- [ ] A hotkey another app already owns shows "Hotkey … is already in use or invalid" in Settings, and the previous hotkey still works.
- [ ] Recording a hotkey with only a modifier pressed does not save anything; Backspace clears it.
- [ ] Hold: release the modifier before the main key; the panel still hides when the main key is released.

## Instant Quick Panel (v4)
- [ ] The panel appears and disappears with no fade (DWM transitions forced off). Known limit: if Windows still animates on some builds, note the build here.
- [ ] First show after launch is immediate (the window is created hidden at startup).
- [ ] Sounds added while the panel is hidden appear when it is shown.

## Sidebar and pads (v4)
- [ ] Drag the sidebar handle: the pad grid reflows; the width stops at 280 px and at half the window.
- [ ] Double-click the handle: back to 300 px.
- [ ] Restart the app: the sidebar width is restored.
- [ ] Trim waveform redraws at the new width.
- [ ] Pressing Play on an idle pad does not move the Play button (Stop slot stays reserved).

## Device identity and preview (v5)
- [ ] Main = virtual cable, preview = headphones: Preview plays only on headphones, with no error.
- [ ] Same check after an app restart (saved device IDs load and match).
- [ ] Two outputs with the same or similar name: each is selected and used separately.
- [ ] Preview = main (both explicit): Settings shows the inline warning; Preview shows the message with an "Open Settings" action.
- [ ] Preview unset while Windows default is the main output: same-device message, not a false error.
- [ ] Unplug the saved main or preview device, restart: play shows "Device not found, please select it again in Settings".
- [ ] A config from before v5 (device names) still selects the same devices after the first start.

## Quick Panel v5
- [ ] Right click a tile: sound plays only on the preview device, not on the cable.
- [ ] Stop button next to search stops main and preview sounds.
- [ ] Hint line reads "Left click: play · Right click: preview".

## Windows-only items not run in WSL
The v2 playback routing (preview device, Stop per sound, playback events),
global hotkey toggling, Recycle Bin delete and the Windows installer were not
run on a Windows machine when this list was written. Check every item above
before a release.

## Robustness
- [ ] Corrupt `%APPDATA%\com.moyboard.app\moyboard.json`: app shows an error at startup and does not overwrite the file.
- [ ] Remove the library folder while running: Rescan shows an error, app stays responsive.
- [ ] Idle CPU near zero; memory stays low with the window open for 10 minutes.
