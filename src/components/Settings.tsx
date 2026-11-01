import { useEffect, useState } from "react";
import { api, pickFolder } from "../api";
import type { AppSettings, AutostartSettings, OutputState, QuickPanelSettings, RoutingState, TileSizeKind, TileSizes } from "../types";
import { AudioRouting } from "./AudioRouting";
import { ConfirmDialog } from "./ConfirmDialog";
import { HotkeyField } from "./HotkeyField";
import { Select } from "./Select";

type Props = {
  libraryDir: string;
  output: OutputState;
  onLibraryChanged: (dir: string) => void;
  onOutputChanged: (patch: Partial<OutputState>) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
  onReset: () => void;
  tileSizes: TileSizes;
  onTileSizeChanged: (kind: TileSizeKind, size: number) => void;
  onOpenGuide: () => void;
};

export function Settings({
  libraryDir,
  output,
  onLibraryChanged,
  onOutputChanged,
  onRefresh,
  onError,
  onReset,
  tileSizes,
  onTileSizeChanged,
  onOpenGuide,
}: Props) {
  const [routing, setRouting] = useState<RoutingState | null>(null);
  useEffect(() => {
    api.getRouting().then(setRouting).catch((e) => onError(String(e)));
  }, [onError]);

  return (
    <div className="settings">
      <section className="settings-section">
        <h2>Library folder</h2>
        <p className="path">{libraryDir}</p>
        <p className="hint">Sounds are copied into this folder. Drop files on the window or add them here yourself.</p>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              const dir = await pickFolder();
              if (!dir) return;
              onLibraryChanged(await api.setLibraryDir(dir));
              onRefresh();
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          Change folder
        </button>
      </section>

      <section className="settings-section">
        <h2>Audio routing</h2>
        {routing && (
          <AudioRouting
            routing={routing}
            outputs={output.devices}
            onRoutingChanged={setRouting}
            onOpenGuide={async () => {
              // Opening the guide marks it as in progress unless a cable is already set up.
              // The state is saved before the guide opens, so a restart right after resumes it.
              if (routing.setupState !== "completed") {
                try {
                  await api.setSetupState("guided");
                } catch (e) {
                  onError(String(e));
                }
              }
              onOpenGuide();
            }}
            onError={onError}
          />
        )}
      </section>

      <section className="settings-section">
        <h2>For others</h2>
        {routing?.mode === "mix" ? (
          <>
            <p className="hint">In Mode B, sounds go to the virtual cable chosen under Audio routing.</p>
          </>
        ) : (
          <>
            <p className="hint">Pick the virtual cable that your app or game listens to.</p>
            <Select
              aria-label="For others"
              value={output.selected ?? ""}
              options={[
                { value: "", label: "System default" },
                ...output.devices.map((d) => ({ value: d.id, label: d.name + (d.isDefault ? " (default)" : "") })),
              ]}
              onChange={async (v) => {
                const name = v || null;
                try {
                  await api.setOutputDevice(name);
                  onOutputChanged({ selected: name });
                } catch (err) {
                  onError(String(err));
                }
              }}
            />
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>Tile size</h2>
        <p className="hint">Smallest width and height of a tile. Tiles reflow to fit the window.</p>
        <TileNumber
          label="Soundboard width"
          value={tileSizes.pad}
          min={96}
          max={240}
          onChange={(v) => onTileSizeChanged("pad", v)}
        />
        <TileNumber
          label="Soundboard height"
          value={tileSizes.padHeight}
          min={64}
          max={240}
          onChange={(v) => onTileSizeChanged("padHeight", v)}
        />
        <TileNumber
          label="Quick Panel width"
          value={tileSizes.quick}
          min={16}
          max={400}
          onChange={(v) => onTileSizeChanged("quick", v)}
        />
        <TileNumber
          label="Quick Panel height"
          value={tileSizes.quickHeight}
          min={16}
          max={400}
          onChange={(v) => onTileSizeChanged("quickHeight", v)}
        />
      </section>

      <section className="settings-section">
        <h2>Preview output</h2>
        <p className="hint">
          Headphone previews play here. If this is the output above too (a headset with mic), the preview is heard there as well.
        </p>
        <Select
          aria-label="Preview output"
          value={output.previewSelected ?? ""}
          options={[
            { value: "", label: "System default" },
            ...output.devices.map((d) => ({ value: d.id, label: d.name + (d.isDefault ? " (default)" : "") })),
          ]}
          onChange={async (v) => {
            const name = v || null;
            try {
              await api.setPreviewDevice(name);
              onOutputChanged({ previewSelected: name });
            } catch (err) {
              onError(String(err));
            }
          }}
        />
      </section>

      <AutoRescan onError={onError} onChanged={onRefresh} />

      <CloseToTray onError={onError} />

      <QuickPanelSection onError={onError} />

      <StopAllSection onError={onError} />

      <StartupSection onError={onError} />

      <ResetSection onError={onError} onReset={onReset} />

    </div>
  );
}

function AutoRescan({ onError, onChanged }: { onError: (m: string) => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => onError(String(e)));
  }, [onError]);
  return (
    <section className="settings-section">
      <h2>Folder watching</h2>
      <label className="inline-field">
        <input
          type="checkbox"
          checked={settings?.autoRescan ?? false}
          disabled={!settings}
          onChange={async (e) => {
            const enabled = e.target.checked;
            setSettings((prev) => (prev ? { ...prev, autoRescan: enabled } : prev));
            try {
              await api.setAutoRescan(enabled);
              onChanged();
            } catch (err) {
              onError(String(err));
            }
          }}
        />
        <span>Refresh automatically when files change in the library folder</span>
      </label>
    </section>
  );
}

/** Closing the window hides it to the tray (default). Off means closing quits the app. */
function CloseToTray({ onError }: { onError: (m: string) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setEnabled(s.closeToTray))
      .catch((e) => onError(String(e)));
  }, [onError]);
  return (
    <section className="settings-section">
      <h2>Window</h2>
      <label className="inline-field">
        <input
          type="checkbox"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={async (e) => {
            const next = e.target.checked;
            setEnabled(next);
            try {
              await api.setCloseToTray(next);
            } catch (err) {
              setEnabled(!next);
              onError(String(err));
            }
          }}
        />
        <span>Keep running in the tray when the window is closed</span>
      </label>
      <p className="hint">With this off, closing the window quits moyboard. Use the tray menu to quit otherwise.</p>
    </section>
  );
}

/** Hotkey and mode for the Quick Panel. Hold shows it while the key is down; Toggle flips it per press. */
function QuickPanelSection({ onError }: { onError: (m: string) => void }) {
  const [cfg, setCfg] = useState<QuickPanelSettings | null>(null);
  useEffect(() => {
    api
      .getQuickPanelSettings()
      .then(setCfg)
      .catch((e) => onError(String(e)));
  }, [onError]);

  // Saves at once. A refused hotkey (taken by a sound, or by another app) reverts and shows why.
  const save = async (next: QuickPanelSettings) => {
    const prev = cfg;
    setCfg(next);
    try {
      await api.setQuickPanelSettings(next.hotkey, next.mode);
    } catch (e) {
      setCfg(prev);
      onError(String(e));
    }
  };

  return (
    <section className="settings-section">
      <h2>Quick Panel</h2>
      <p className="hint">
        A small board of sounds over other windows, opened by a hotkey. It works over windowed and borderless games,
        not exclusive fullscreen.
      </p>
      {cfg && (
        <>
          <div className="inline-field">
            <span>Hotkey</span>
            <span className="hotkey-row">
              <HotkeyField value={cfg.hotkey} onChange={(h) => void save({ ...cfg, hotkey: h })} />
            </span>
          </div>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => void api.resetQuickPanelGeometry().catch((e) => onError(String(e)))}
            >
              Reset panel position and size
            </button>
          </p>
          <fieldset className="radio-row">
            <legend>Mode</legend>
            <label className="inline-field">
              <input
                type="radio"
                name="quick-mode"
                checked={cfg.mode === "hold"}
                onChange={() => void save({ ...cfg, mode: "hold" })}
              />
              <span>Hold: shown while the hotkey is down</span>
            </label>
            <label className="inline-field">
              <input
                type="radio"
                name="quick-mode"
                checked={cfg.mode === "toggle"}
                onChange={() => void save({ ...cfg, mode: "toggle" })}
              />
              <span>Toggle: press to show, press again or Esc to hide</span>
            </label>
          </fieldset>
        </>
      )}
    </section>
  );
}

/** Global hotkey that stops every playing sound, also while the window is hidden. */
function StopAllSection({ onError }: { onError: (m: string) => void }) {
  const [hotkey, setHotkey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api
      .getStopAllHotkey()
      .then(setHotkey)
      .catch((e) => onError(String(e)));
  }, [onError]);

  // Saves at once. A refused hotkey reverts and shows why.
  const save = async (next: string | null) => {
    const prev = hotkey;
    setHotkey(next);
    try {
      await api.setStopAllHotkey(next);
    } catch (e) {
      setHotkey(prev);
      onError(String(e));
    }
  };

  return (
    <section className="settings-section">
      <h2>Stop all sounds</h2>
      {hotkey !== undefined && (
        <div className="inline-field">
          <span>Hotkey</span>
          <span className="hotkey-row">
            <HotkeyField value={hotkey} onChange={(h) => void save(h)} />
          </span>
        </div>
      )}
    </section>
  );
}

/** Puts every setting back to its default. Sounds and categories stay. */
function ResetSection({ onError, onReset }: { onError: (m: string) => void; onReset: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <section className="settings-section">
      <h2>Reset settings</h2>
      <p className="hint">
        Sets every setting back to its default: outputs, volumes, tile sizes, hotkeys, library folder and Start with
        Windows. Your sounds and categories stay.
      </p>
      <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>
        Reset settings
      </button>
      {asking && (
        <ConfirmDialog
          title="Reset settings?"
          body="Every setting goes back to its default. Sounds and categories stay."
          confirmLabel="Reset"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void api.resetSettings().then(onReset).catch((e) => onError(String(e)));
          }}
        />
      )}
    </section>
  );
}

/** Start with Windows writes the Run entry. The state is read from the system each time Settings opens. */
function StartupSection({ onError }: { onError: (m: string) => void }) {
  const [state, setState] = useState<AutostartSettings | null>(null);
  useEffect(() => {
    api
      .getAutostart()
      .then(setState)
      .catch((e) => onError(String(e)));
  }, [onError]);

  // Applies one change; on failure the switch goes back to what the system reports.
  const change = async (patch: Partial<AutostartSettings>) => {
    if (!state) return;
    const next = { ...state, ...patch };
    setState(next);
    try {
      if (patch.enabled !== undefined) await api.setAutostart(patch.enabled);
      if (patch.startMinimized !== undefined) await api.setStartMinimized(patch.startMinimized);
    } catch (e) {
      onError(String(e));
      api
        .getAutostart()
        .then(setState)
        .catch((err) => onError(String(err)));
    }
  };

  return (
    <section className="settings-section">
      <h2>Startup</h2>
      <label className="inline-field">
        <input
          type="checkbox"
          checked={state?.enabled ?? false}
          disabled={!state}
          onChange={(e) => void change({ enabled: e.target.checked })}
        />
        <span>Start moyboard with Windows</span>
      </label>
      <label className="inline-field">
        <input
          type="checkbox"
          checked={state?.startMinimized ?? false}
          disabled={!state}
          onChange={(e) => void change({ startMinimized: e.target.checked })}
        />
        <span>Start minimized to tray</span>
      </label>
      <p className="hint">Minimized start only applies when moyboard starts with Windows.</p>
    </section>
  );
}

/** Number entry in px for a tile size. Saves each valid value within min..max. */
function TileNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="inline-field">
      <span>{label}</span>
      <span className="tile-number">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
          }}
        />
        <span>px</span>
      </span>
    </label>
  );
}

