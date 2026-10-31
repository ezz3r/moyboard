// Browser-preview backend. Dev builds only, loaded by api.ts when not inside Tauri.
import type { SoundMeta } from "./types";

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
let monitor: string | null = null;
let monitorVolume = 1;
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
let library = dir;

function blank(): SoundMeta {
  return { category: null, emoji: null, volume: null, hotkey: null, trimStart: null, trimEnd: null };
}

const devices = [
  { name: "Speakers (Realtek Audio)", isDefault: true },
  { name: "CABLE Input (VB-Audio Virtual Cable)", isDefault: false },
  { name: "Headphones (USB Audio)", isDefault: false },
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
    case "list_output_devices":
      return { devices, selected: output, monitorSelected: monitor, monitorVolume, previewSelected: preview } as T;
    case "set_preview_device":
      preview = (args.name as string | null) ?? null;
      return undefined as T;
    case "set_monitor_device":
      monitor = (args.name as string | null) ?? null;
      return undefined as T;
    case "set_monitor_volume":
      monitorVolume = args.volume as number;
      return undefined as T;
    case "get_settings":
      return { autoRescan } as T;
    case "set_auto_rescan":
      autoRescan = args.enabled as boolean;
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
      return undefined as T;
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}
