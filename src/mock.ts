// Browser-preview backend. Dev builds only, loaded by api.ts when not inside Tauri.
import type { CategoryMeta, SoundMeta } from "./types";

const dir = "C:\\Users\\you\\Music\\moyboard";
const files: Record<string, SoundMeta> = {
  "airhorn.mp3": { ...blank(), category: "Memes", emoji: "📣" },
  "rimshot.wav": { ...blank(), category: "Memes", emoji: "🥁" },
  "crowd-cheer.ogg": { ...blank(), category: "Reactions", emoji: "👏", volume: 1.4 },
  "sad-trombone.flac": { ...blank(), category: "Reactions", emoji: "🎺" },
  "frog.mp3": { ...blank(), category: "Animals", emoji: "🐸" },
  "duck.wav": { ...blank(), emoji: "🦆" },
  "intro theme.mp3": { ...blank(), category: "Music" },
  "bruh.wav": { ...blank(), category: "Memes" },
};
const missing: Record<string, SoundMeta> = {
  "old-alarm.wav": { ...blank(), category: "Alerts", emoji: "🚨" },
};
let output: string | null = null;
let monitorVolume = 1;
let masterVolume = 1;
let preview: string | null = null;
// Playback is simulated: a sound plays for 3 s, then ends on its own.
type Playing = { fileName: string; previewing: boolean };
let playing: Playing[] = [];
const listeners = new Set<(p: Playing[]) => void>();

function setPlaying(next: Playing[]) {
  playing = next;
  listeners.forEach((l) => l(next));
}

function start(fileName: string, previewing: boolean) {
  setPlaying([...playing, { fileName, previewing }]);
  setTimeout(() => {
    const i = playing.findIndex((p) => p.fileName === fileName && p.previewing === previewing);
    if (i >= 0) setPlaying(playing.filter((_, j) => j !== i));
  }, 3000);
}

/** Each call gets its own entry, so the same handler can subscribe twice (StrictMode does). */
export function subscribePlayback(handler: (p: Playing[]) => void): () => void {
  const entry = (p: Playing[]) => handler(p);
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}
let autoRescan = true;
let closeToTray = true;
let sidebarWidth = 300;
let tileSizes = { pad: 128, padHeight: 128, quick: 56, quickHeight: 56 };
let autostart = false;
let startMinimized = false;
let quickHotkey: string | null = null;
let quickMode: "hold" | "toggle" = "toggle";
let stopHotkey: string | null = null;
let recentColors: string[] = [];
// Mode B routing. The cable is "connected" only when a test (or the dev user) turns it on.
let audioMode: "sounds" | "mix" = "sounds";
let cablePlayback: string | null = null;
let cableRecord: string | null = null;
let micId: string | null = null;
let micVolume = 1;
let bannerDismissed = false;
// Mock mic: running only in Mode B with a microphone chosen. `micFailure` lets e2e simulate a denied mic.
let micFailure: string | null = null;
// The guide state survives a reload in this tab, so e2e can test the resume on start.
function readSetupState(): "guided" | "completed" | null {
  try {
    const v = sessionStorage.getItem("mockSetupState");
    return v === "guided" || v === "completed" ? v : null;
  } catch {
    return null;
  }
}
let setupState: "guided" | "completed" | null = readSetupState();
let cableConnected = false;
const inputs = [
  { id: "wasapi:mic", name: "Microphone (USB Audio)", isDefault: true },
];
const cableInputs = [
  { id: "wasapi:cable-out", name: "CABLE Output (VB-Audio Virtual Cable)", isDefault: false },
];
// Dev and e2e only: makes the mock mic fail with this message (null = working).
(window as unknown as { __mockMicFailure: (msg: string | null) => void }).__mockMicFailure = (msg: string | null) => {
  micFailure = msg;
};
// Dev and e2e only: lets a test plug the cable in while the guide is waiting.
(window as unknown as { __mockCable: (on: boolean) => void }).__mockCable = (on: boolean) => {
  cableConnected = on;
};
let library = dir;

function blank(): SoundMeta {
  return { category: null, emoji: null, volume: null, color: null, hotkey: null, trimStart: null, trimEnd: null };
}

// Category ids are the keys. "Memes" has no entry on purpose: legacy sounds store the name as id.
const categories: Record<string, CategoryMeta> = {
  Reactions: { name: "Reactions", color: "#7cb787" },
  "c-ideas": { name: "Ideas", color: "#5fb3c9" },
};

const devices = [
  { id: "wasapi:speakers", name: "Speakers (Realtek Audio)", isDefault: true },
  { id: "wasapi:cable", name: "CABLE Input (VB-Audio Virtual Cable)", isDefault: false },
  { id: "wasapi:headphones", name: "Headphones (USB Audio)", isDefault: false },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  await delay(40);
  const name = args.fileName as string | undefined;
  switch (cmd) {
    case "get_library_dir":
      return library as T;
    case "set_library_dir":
      library = args.path as string;
      return library as T;
    case "rescan":
      return [
        ...Object.entries(files).map(([fileName, meta]) => ({ fileName, missing: false, meta })),
        ...Object.entries(missing).map(([fileName, meta]) => ({ fileName, missing: true, meta })),
      ] as T;
    case "import_files": {
      const paths = args.paths as string[];
      const imported = paths.map((p) => p.split(/[\\/]/).pop() as string);
      imported.forEach((f) => (files[f] = blank()));
      return { imported, errors: [] } as T;
    }
    case "set_sound_meta":
      files[name!] = args.meta as SoundMeta;
      return undefined as T;
    case "rename_sound": {
      const to = args.newName as string;
      files[to] = files[name!];
      delete files[name!];
      return to as T;
    }
    case "forget_sound":
      delete missing[name!];
      return undefined as T;
    case "delete_sound":
      delete files[name!];
      setPlaying(playing.filter((p) => p.fileName !== name));
      return undefined as T;
    case "list_categories":
      return categories as T;
    case "new_category": {
      const id = `c${Date.now().toString(16)}`;
      categories[id] = { name: args.name as string, color: null };
      return id as T;
    }
    case "set_category":
      categories[args.id as string] = { name: args.name as string, color: (args.color as string | null) ?? null };
      return undefined as T;
    case "delete_category": {
      const id = args.id as string;
      delete categories[id];
      for (const meta of Object.values(files)) if (meta.category === id) meta.category = null;
      return undefined as T;
    }
    case "list_output_devices":
      return { devices, selected: output, masterVolume, monitorVolume, previewSelected: preview } as T;
    case "get_routing":
      return { mode: audioMode, cablePlayback, cableRecord, setupState, micId, micVolume, bannerDismissed } as T;
    case "get_mic_status":
      return {
        active: audioMode === "mix",
        running: audioMode === "mix" && micFailure === null,
        error: audioMode === "mix" ? micFailure : null,
      } as T;
    case "get_mic_level":
      return (audioMode === "mix" && micFailure === null ? 0.25 : 0) as T;
    case "set_mic_device":
      micId = (args.id as string | null) ?? null;
      return undefined as T;
    case "set_mic_volume":
      micVolume = args.volume as number;
      return undefined as T;
    case "test_cable":
      if (audioMode !== "mix") throw new Error('Choose "Mic and sounds" first.');
      if (!cableRecord) throw new Error("Choose a cable first.");
      if (!cableConnected) throw new Error("No sound arrived on the recording side. Check that moyboard is running and that your app uses the recording side.");
      return undefined as T;
    case "dismiss_banner":
      bannerDismissed = true;
      return undefined as T;
    case "open_mic_privacy":
      return undefined as T;
    case "set_audio_mode": {
      const mode = args.mode as "sounds" | "mix";
      if (mode === "mix" && !cablePlayback) throw new Error("Choose a virtual cable first.");
      audioMode = mode;
      return undefined as T;
    }
    case "set_cable": {
      if (!cableConnected) throw new Error("That cable is not connected. Check that both sides are listed in Windows.");
      cablePlayback = args.playback as string;
      cableRecord = args.record as string;
      return undefined as T;
    }
    case "detect_cable":
      if (!cableConnected) return null as T;
      return {
        playbackId: "wasapi:cable",
        playbackName: "CABLE Input (VB-Audio Virtual Cable)",
        recordId: "wasapi:cable-out",
        recordName: "CABLE Output (VB-Audio Virtual Cable)",
      } as T;
    case "set_setup_state":
      setupState = (args.state as "guided" | "completed" | null) ?? null;
      try {
        if (setupState) sessionStorage.setItem("mockSetupState", setupState);
        else sessionStorage.removeItem("mockSetupState");
      } catch {
        // Storage can be blocked. The mock still works for this page load.
      }
      return undefined as T;
    case "list_input_devices":
      return (cableConnected ? [...inputs, ...cableInputs] : inputs) as T;
    case "open_url":
      return undefined as T;
    case "set_preview_device":
      preview = (args.name as string | null) ?? null;
      return undefined as T;
    case "set_monitor_volume":
      monitorVolume = args.volume as number;
      return undefined as T;
    case "get_settings":
      return { autoRescan, closeToTray } as T;
    case "set_auto_rescan":
      autoRescan = args.enabled as boolean;
      return undefined as T;
    case "get_quick_panel_settings":
      return { hotkey: quickHotkey, mode: quickMode } as T;
    case "set_quick_panel_settings": {
      const hotkey = (args.hotkey as string | null) || null;
      const clash = hotkey && Object.values(files).find((m) => m.hotkey === hotkey);
      if (clash) throw new Error(`${hotkey} already uses this hotkey`);
      if (hotkey && hotkey === stopHotkey) throw new Error("Stop all sounds already uses this hotkey");
      quickHotkey = hotkey;
      quickMode = args.mode as "hold" | "toggle";
      return undefined as T;
    }
    case "get_recent_colors":
      return [...recentColors] as T;
    case "push_recent_color": {
      const color = String(args.color).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error(`invalid colour: ${color}`);
      recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 8);
      return undefined as T;
    }
    case "get_stop_all_hotkey":
      return stopHotkey as T;
    case "set_stop_all_hotkey": {
      const hotkey = (args.hotkey as string | null) || null;
      const clash = hotkey && Object.values(files).find((m) => m.hotkey === hotkey);
      if (clash) throw new Error(`${hotkey} already uses this hotkey`);
      if (hotkey && hotkey === quickHotkey) throw new Error("Quick Panel already uses this hotkey");
      stopHotkey = hotkey;
      return undefined as T;
    }
    case "save_quick_panel_geometry":
    case "reset_quick_panel_geometry":
      return undefined as T;
    case "show_quick_panel":
    case "hide_quick_panel":
      return undefined as T;
    case "get_autostart":
      return { enabled: autostart, startMinimized } as T;
    case "set_autostart":
      autostart = args.enabled as boolean;
      return undefined as T;
    case "set_start_minimized":
      startMinimized = args.enabled as boolean;
      return undefined as T;
    case "get_tile_sizes":
      return { ...tileSizes } as T;
    case "set_tile_size":
      tileSizes = { ...tileSizes, [args.kind as string]: args.size as number };
      return undefined as T;
    case "get_sidebar_width":
      return sidebarWidth as T;
    case "set_sidebar_width":
      sidebarWidth = args.width as number;
      return undefined as T;
    case "set_close_to_tray":
      closeToTray = args.enabled as boolean;
      return undefined as T;
    case "set_output_device":
      output = (args.name as string | null) ?? null;
      return undefined as T;
    case "play_sound":
      if (!files[name!]) throw new Error(`file missing: ${name}`);
      start(name!, false);
      return undefined as T;
    case "stop_sound": {
      const previewOnly = args.previewOnly as boolean | undefined;
      setPlaying(playing.filter((p) => p.fileName !== name || (previewOnly !== undefined && p.previewing !== previewOnly)));
      return undefined as T;
    }
    case "waveform": {
      if (!files[name!]) throw new Error(`file missing: ${name}`);
      const perSec = 100;
      const duration = 4.2;
      const n = Math.round(duration * perSec);
      const peaks = Array.from({ length: n }, (_, i) => {
        const t = i / n;
        const env = Math.exp(-3 * t) * (0.8 + 0.2 * Math.sin(i * 0.7));
        return Math.min(1, Math.abs(env) * (0.6 + 0.4 * Math.abs(Math.sin(i * 0.31))));
      });
      return { peaks, peaksPerSec: perSec, durationSecs: duration } as T;
    }
    case "preview_sound":
      if (!files[name!]) throw new Error(`file missing: ${name}`);
      start(name!, true);
      return undefined as T;
    case "preview_region":
      if (!files[name!]) throw new Error(`file missing: ${name}`);
      return undefined as T;
    case "export_trim": {
      const stem = name!.replace(/\.[^.]+$/, "");
      const out = `${stem} (trimmed).wav`;
      files[out] = { ...blank(), category: files[name!].category, emoji: files[name!].emoji };
      return out as T;
    }
    case "stop_all":
      setPlaying([]);
      return undefined as T;
    case "set_master_volume":
      masterVolume = args.volume as number;
      return undefined as T;
    case "reset_settings":
      // Same defaults as the backend's Config::default; sounds and categories are kept.
      output = null;
      preview = null;
      monitorVolume = 1;
      masterVolume = 1;
      tileSizes = { pad: 128, padHeight: 128, quick: 56, quickHeight: 56 };
      sidebarWidth = 300;
      quickHotkey = null;
      quickMode = "toggle";
      stopHotkey = null;
      autoRescan = true;
      closeToTray = true;
      autostart = false;
      startMinimized = false;
      audioMode = "sounds";
      cablePlayback = null;
      cableRecord = null;
      setupState = null;
      micId = null;
      micVolume = 1;
      bannerDismissed = false;
      return undefined as T;
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}
