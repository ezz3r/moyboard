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
- [ ] "You": each sound also plays on the Windows default output; the "You" volume changes only that copy.
- [ ] Windows default output = main output (e.g. cable is the default): "You" is greyed out and nothing extra plays.
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
- [ ] Preview output set to the same device as the main output (headset with mic): preview plays, and it is heard on the main output too. No error.
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
- [ ] Play and Preview buttons on a pad appear on hover and on keyboard focus; Stop appears only while the sound plays.

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

## Visual redesign (v6)
- [ ] Switch Windows between light and dark: the app follows at once (no restart).
- [ ] Emoji icons render with Segoe UI Emoji in the pad, the sidebar and the emoji picker.
- [ ] Text uses Segoe UI Variable; nothing is cut off at 100% and 150% display scaling.
- [ ] A playing pad shows the steady ring in its category colour; with no category, in the accent colour.
- [ ] Quick Panel shows and hides instantly, with no fade, in both themes.
- [ ] Quick Panel Stop is neutral; the Quick Panel tile badges are readable at 11 px.
- [ ] Idle CPU and memory are unchanged from before the redesign (no blur or continuous animation).
- [ ] Empty board (no sounds): the empty-state text is shown.

## Layout v7
- [ ] Output device and both volume sliders in the bottom bar change the audio on the cable and on the headphones.
- [ ] Monitor slider ("You") is disabled when the monitor output is off; the bar says why on hover.
- [ ] Window minimum 640 × 480 is enforced by Windows; nothing is cut off at that size.
- [ ] Edit card resize handle (left edge of the card) appears on hover, drags, and double-click resets to 300.
- [ ] Window at 150% and 200% display scaling: header title, bottom bar and card fit without overlap.
- [ ] Grid scrolls; the header and the bottom bar do not move.
- [ ] Dark mode: card shadow is visible against the window background.

## Polish v8 (not run on Windows)
- [ ] Quick Panel: open and close 10 times, also after moving and after resizing it. Position and size stay the same every time (not run in WSL; the fix is untested on Windows).
- [ ] Quick Panel: moved to a second monitor and back still opens on the saved monitor at the saved size.
- [ ] Quick Panel at 150 % and 200 % scaling: size stays the same after reopening.
- [ ] Output dropdown opens upward when the bottom bar is low, and clicks outside close it.
- [ ] Icon picker is fully visible inside the edit card at 1200 px and 640 px.

## Playing state, colour and drag (v9, not run on Windows)

- [ ] Stop all sounds hotkey (Settings → Stop all sounds): stops main and preview sounds while the window is hidden in the tray, also from the tray menu.
- [ ] Stop all hotkey clashes: setting it to a key a sound or the Quick Panel uses is refused with a message.
- [ ] Real audio: a sound played for others shows the green speaker badge; a headphone preview for yourself shows the yellow headphones badge; both at once show two badges. Quick Panel tiles show only the coloured border, no badge.
- [ ] Hover only: the Stop button appears only while the pointer is on a playing pad.
- [ ] Colour picker: the popover stays on screen in the narrow sidebar; the red X beside the swatch removes the colour.
- [ ] Drag a pad by press-and-hold onto a category section in the All view (the dragged pad is dimmed). OS file drop of an audio file onto the window still imports the file after a pad drag.
- [ ] Drag inside WebView2 does not start a native file drag or a text selection.

## Windows-only items not run in WSL
The v2 playback routing (preview device, Stop per sound, playback events),
global hotkey toggling, Recycle Bin delete and the Windows installer were not
run on a Windows machine when this list was written. Check every item above
before a release.

## Robustness
- [ ] Corrupt `%APPDATA%\com.moyboard.app\moyboard.json`: app shows an error at startup and does not overwrite the file.
- [ ] Remove the library folder while running: Rescan shows an error, app stays responsive.
- [ ] Idle CPU near zero; memory stays low with the window open for 10 minutes.

## You, Others and Reset settings (v10, not run on Windows)

- [ ] "You" moves on a machine where the Windows default output is the main output (headset for both): sounds still play, and previews follow the "You" volume.
- [ ] "You" and "Others" keep their values after a restart.
- [ ] Changing "Play to" or the preview device does not disable "You".
- [ ] Reset settings: after confirming, the output, preview, volumes, tile sizes, Quick Panel hotkey and mode, Stop all hotkey, library folder and "Start with Windows" are back to default; sounds and categories are still there.
- [ ] Reset settings with "Start with Windows" on: the Run entry is removed (check the Startup folder or Task Manager's Startup tab).

## Installer choice page (guided cable setup, not run on Windows)
- [ ] Installer runs without admin prompt (`installMode: currentUser`).
- [ ] English and German installer: "Virtual audio device" page appears after the directory page.
- [ ] Default selection is "I already have one". Next writes `existing`.
- [ ] Choosing "No, I only have a microphone" then Next writes `none`.
- [ ] `reg query HKCU\Software\moyboard\Setup` shows `VirtualDevice` with the chosen value.
- [ ] Silent `moyboard_*_x64-setup.exe /S` writes `existing`; `/S /VIRTUALDEVICE=none` writes `none`.
- [ ] Silent install does not show the choice page.
- [ ] Umlauts render correctly in the German page (`$\u` escapes in the template).

## Audio routing and cable guide (Mode A/B, not run on Windows)
- [ ] Settings → Audio routing: "Sounds only" keeps the For others selector working.
- [ ] "Mic and sounds" without a saved cable shows "Choose a virtual cable first." and stays on Sounds only.
- [ ] With VB-CABLE installed, the cable line shows "Detected: CABLE Input / CABLE Output" and Discord input names the CABLE Output device.
- [ ] Mode B: For others is replaced by the Mode B note; output really goes to the cable (play a pad, check the cable's meter in Windows).
- [ ] Switching back to Sounds only restores the saved For others output.
- [ ] Setup guide without a cable: "Waiting for the virtual cable…"; installing VB-CABLE (no reboot) turns it into "Virtual cable found" within about 2 s.
- [ ] Setup guide "Open download page" opens https://vb-audio.com/Cable/ in the default browser (`explorer.exe`).
- [ ] Guide started from Settings, app closed and reopened before a cable exists: the guide opens on start.
- [ ] "Remind me later" closes the guide; it opens again on the next start while no cable is set up.
- [ ] "I use something else" leaves the guide and opens Settings.
- [ ] Checked the VB-Audio step texts against the live page (they can change).
- [ ] Unplugging the cable while Mode B is active: the cable line shows "Not connected" (no crash).

## Mode B: mic and sounds (Windows, real devices)
- [ ] Fresh VB-CABLE install on a clean VM or snapshot: after Refresh, the cable is detected and the install hint disappears.
- [ ] No cable: the hint box shows "Open VB-Audio website", and it opens https://vb-audio.com/Cable/ in the browser.
- [ ] Mic and sounds: Discord (input = CABLE Output) hears the microphone and sounds together.
- [ ] Mic level meter moves while speaking; microphone volume changes what Discord hears.
- [ ] Test cable: success message on a working setup; error message after unplugging the cable.
- [ ] Mic unplugged while running: Settings shows the error; plugging it back in restarts the mic within about 2 s.
- [ ] Microphone privacy denied (Windows Settings → Privacy → Microphone off for desktop apps): error and the privacy button opens `ms-settings:privacy-microphone`.
- [ ] Tray tooltip reads "moyboard – Mic routing active" in Mode B and "moyboard" in Mode A.
- [ ] Latency: speaking and hearing it in Discord's self-view feels acceptable (no multi-second delay).
- [ ] 30+ minute run with sounds and speech: no crackling, no growing delay (drift handling in `moyboard-core/src/mic.rs`).
- [ ] Sample rates 44.1, 48 and 96 kHz for the mic and the cable (Windows sound settings).
- [ ] Mixer setup (Wave Link, VoiceMeeter) still works in Sounds only mode.
- [ ] Quick Panel, hotkeys and stop-all work unchanged in both modes.
- [ ] Banner on the pads until a cable is saved or dismissed; dismiss stays after restart.
