// Mirrors the serde output of the Rust commands (camelCase, null for None).

export type SoundMeta = {
  category: string | null;
  emoji: string | null;
  volume: number | null;
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
};

export type AppSettings = {
  autoRescan: boolean;
};

export const emptyMeta: SoundMeta = {
  category: null,
  emoji: null,
  volume: null,
  hotkey: null,
  trimStart: null,
  trimEnd: null,
};

export type Waveform = {
  peaks: number[];
  peaksPerSec: number;
  durationSecs: number;
};
