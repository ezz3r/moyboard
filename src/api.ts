import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  AutostartSettings,
  CategoryMeta,
  QuickPanelSettings,
  TileSizeKind,
  TileSizes,
  ImportReport,
  OutputState,
  Playing,
  SoundEntry,
  SoundMeta,
  Waveform,
} from "./types";

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
  listCategories: () => call<Record<string, CategoryMeta>>("list_categories"),
  newCategory: (name: string) => call<string>("new_category", { name }),
  setCategory: (id: string, name: string, color: string | null) =>
    call<void>("set_category", { id, name, color }),
  deleteCategory: (id: string) => call<void>("delete_category", { id }),
  importFiles: (paths: string[]) => call<ImportReport>("import_files", { paths }),
  setSoundMeta: (fileName: string, meta: SoundMeta) => call<void>("set_sound_meta", { fileName, meta }),
  renameSound: (fileName: string, newName: string) => call<string>("rename_sound", { fileName, newName }),
  forgetSound: (fileName: string) => call<void>("forget_sound", { fileName }),
  deleteSound: (fileName: string) => call<void>("delete_sound", { fileName }),
  listOutputDevices: () => call<OutputState>("list_output_devices"),
  setOutputDevice: (name: string | null) => call<void>("set_output_device", { name }),
  playSound: (fileName: string) => call<void>("play_sound", { fileName }),
  stopSound: (fileName: string, previewOnly?: boolean) => call<void>("stop_sound", { fileName, previewOnly }),
  /** Headphone button: plays on the preview device only. */
  previewSound: (fileName: string) => call<void>("preview_sound", { fileName }),
  /** Trim editor: plays the region being edited on the preview device. */
  previewRegion: (fileName: string, trimStart: number | null, trimEnd: number | null) =>
    call<void>("preview_region", { fileName, trimStart, trimEnd }),
  setPreviewDevice: (name: string | null) => call<void>("set_preview_device", { name }),
  waveform: (fileName: string) => call<Waveform>("waveform", { fileName }),
  exportTrim: (fileName: string, trimStart: number | null, trimEnd: number | null) =>
    call<string>("export_trim", { fileName, trimStart, trimEnd }),
  setMonitorVolume: (volume: number) => call<void>("set_monitor_volume", { volume }),
  getSettings: () => call<AppSettings>("get_settings"),
  setAutoRescan: (enabled: boolean) => call<void>("set_auto_rescan", { enabled }),
  setCloseToTray: (enabled: boolean) => call<void>("set_close_to_tray", { enabled }),
  getTileSizes: () => call<TileSizes>("get_tile_sizes"),
  setTileSize: (kind: TileSizeKind, size: number) => call<void>("set_tile_size", { kind, size }),
  getSidebarWidth: () => call<number>("get_sidebar_width"),
  setSidebarWidth: (width: number) => call<void>("set_sidebar_width", { width }),
  getAutostart: () => call<AutostartSettings>("get_autostart"),
  setAutostart: (enabled: boolean) => call<void>("set_autostart", { enabled }),
  setStartMinimized: (enabled: boolean) => call<void>("set_start_minimized", { enabled }),
  getQuickPanelSettings: () => call<QuickPanelSettings>("get_quick_panel_settings"),
  setQuickPanelSettings: (hotkey: string | null, mode: "hold" | "toggle") =>
    call<void>("set_quick_panel_settings", { hotkey, mode }),
  getStopAllHotkey: () => call<string | null>("get_stop_all_hotkey"),
  setStopAllHotkey: (hotkey: string | null) => call<void>("set_stop_all_hotkey", { hotkey }),
  showQuickPanel: () => call<void>("show_quick_panel"),
  hideQuickPanel: () => call<void>("hide_quick_panel"),
  saveQuickPanelGeometry: (x: number, y: number, width: number, height: number) =>
    call<void>("save_quick_panel_geometry", { x, y, width, height }),
  resetQuickPanelGeometry: () => call<void>("reset_quick_panel_geometry"),
  stopAll: () => call<void>("stop_all"),
  setMasterVolume: (volume: number) => call<void>("set_master_volume", { volume }),
};

/**
 * True inside the Quick Panel window. In the browser preview the same page is opened
 * with `?view=quick`, so it can be tested without Tauri.
 */
export function isQuickPanelWindow(): boolean {
  if (isTauri) return getCurrentWebviewWindow().label === "quick-panel";
  return new URLSearchParams(window.location.search).get("view") === "quick";
}

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

/** Calls back with the full list of sounding voices whenever it changes. */
export async function onPlayback(handler: (playing: Playing[]) => void): Promise<() => void> {
  if (!isTauri) {
    if (!import.meta.env.DEV) return () => {};
    const mock = await import("./mock");
    return mock.subscribePlayback(handler);
  }
  return listen<Playing[]>("playback", (e) => handler(e.payload));
}

/** Calls back when the library folder changes on disk. Returns an unsubscribe function. */
export async function onLibraryChanged(handler: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen("library-changed", () => handler());
}
