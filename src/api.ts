import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImportReport, OutputState, SoundEntry, SoundMeta } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;

// Outside the app (browser preview in dev only) calls go to an in-memory mock.
// The dynamic import is dead code in production builds.
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(cmd, args);
  if (!import.meta.env.DEV) throw new Error("moyboard must run inside the app");
  const mock = await import("./mock");
  return mock.call(cmd, args) as Promise<T>;
}

export const api = {
  getLibraryDir: () => call<string>("get_library_dir"),
  setLibraryDir: (path: string) => call<string>("set_library_dir", { path }),
  rescan: () => call<SoundEntry[]>("rescan"),
  importFiles: (paths: string[]) => call<ImportReport>("import_files", { paths }),
  setSoundMeta: (fileName: string, meta: SoundMeta) => call<void>("set_sound_meta", { fileName, meta }),
  renameSound: (fileName: string, newName: string) => call<string>("rename_sound", { fileName, newName }),
  forgetSound: (fileName: string) => call<void>("forget_sound", { fileName }),
  listOutputDevices: () => call<OutputState>("list_output_devices"),
  setOutputDevice: (name: string | null) => call<void>("set_output_device", { name }),
  playSound: (fileName: string) => call<void>("play_sound", { fileName }),
  stopAll: () => call<void>("stop_all"),
  setMasterVolume: (volume: number) => call<void>("set_master_volume", { volume }),
};

export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return window.prompt("Library folder path") || null;
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

export type DropEvent = { type: "enter" | "leave" } | { type: "drop"; paths: string[] };

/** Subscribes to files dropped on the window. Returns an unsubscribe function. */
export async function onFileDrop(handler: (ev: DropEvent) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return getCurrentWebview().onDragDropEvent((e) => {
    const p = e.payload;
    if (p.type === "drop") handler({ type: "drop", paths: p.paths });
    else if (p.type === "enter" || p.type === "leave") handler({ type: p.type });
  });
}
