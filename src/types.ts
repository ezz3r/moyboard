// Mirrors the serde output of the Rust commands (camelCase, null for None).

export type SoundMeta = {
  /** A category id (see `CategoryMeta` map keys), not its display name. */
  category: string | null;
  emoji: string | null;
  volume: number | null;
  /** Pad colour override, `#rrggbb`. */
  color: string | null;
  hotkey: string | null;
  trimStart: number | null;
  trimEnd: number | null;
};

export type SoundEntry = {
  fileName: string;
  missing: boolean;
  meta: SoundMeta;
};

export type ImportReport = {
  imported: string[];
  errors: string[];
};

export type OutputDevice = {
  /** Stable endpoint ID; stored and compared. */
  id: string;
  /** Display only. */
  name: string;
  isDefault: boolean;
};

export type OutputState = {
  devices: OutputDevice[];
  selected: string | null;
  /** Volume for "Others" (the main output), 0..2. */
  masterVolume: number;
  /** Volume for "You" (the Windows default output and previews), 0..2. */
  monitorVolume: number;
  previewSelected: string | null;
};

/** One voice that is sounding. A sound can have a main voice, a preview voice, or both. */
export type Playing = {
  fileName: string;
  previewing: boolean;
};

export type QuickPanelSettings = {
  /** Global hotkey in the backend's format, or null for none. */
  hotkey: string | null;
  mode: "hold" | "toggle";
};

export type AutostartSettings = {
  /** The system's Run entry, read when Settings opens. */
  enabled: boolean;
  startMinimized: boolean;
};

export type AppSettings = {
  autoRescan: boolean;
  closeToTray: boolean;
};

export type CategoryMeta = {
  name: string;
  color: string | null;
};

export const emptyMeta: SoundMeta = {
  category: null,
  emoji: null,
  volume: null,
  color: null,
  hotkey: null,
  trimStart: null,
  trimEnd: null,
};

export type Waveform = {
  peaks: number[];
  peaksPerSec: number;
  durationSecs: number;
};

/** Minimum tile width in CSS pixels: soundboard pads and Quick Panel tiles. */
/** Soundboard and Quick Panel tile sizes in CSS pixels: minimum width, and height. */
/** Which tile size a Settings slider changes. */
export type TileSizeKind = "pad" | "padHeight" | "quick" | "quickHeight";

export type TileSizes = { pad: number; padHeight: number; quick: number; quickHeight: number };

/** "sounds" = Mode A (sounds to one output). "mix" = Mode B (sounds into the virtual cable). */
export type AudioMode = "sounds" | "mix";

/** Guided cable setup: null = not started, "guided" = waiting for a cable, "completed" = done. */
export type SetupState = "guided" | "completed" | null;

export type RoutingState = {
  mode: AudioMode;
  cablePlayback: string | null;
  cableRecord: string | null;
  setupState: SetupState;
  /** Mode B microphone endpoint ID; null means the Windows default. */
  micId: string | null;
  /** Mic gain, 0..=2. */
  micVolume: number;
  bannerDismissed: boolean;
};

/** Mode B mic state. `error` is the reason the last start failed, or null. */
export type MicStatus = {
  active: boolean;
  running: boolean;
  error: string | null;
};

/** A virtual cable with both sides connected. Playback is written to, record is read by the app. */
export type CablePair = {
  playbackId: string;
  playbackName: string;
  recordId: string;
  recordName: string;
};
