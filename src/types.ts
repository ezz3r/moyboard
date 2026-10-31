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
  name: string;
  isDefault: boolean;
};

export type OutputState = {
  devices: OutputDevice[];
  selected: string | null;
  monitorSelected: string | null;
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
