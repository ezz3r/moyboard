import { useEffect, useState } from "react";
import { api, pickFolder } from "../api";
import type { AppSettings, AutostartSettings, OutputState, QuickPanelSettings, TileSizes } from "../types";
import { HotkeyField } from "./HotkeyField";

type Props = {
  libraryDir: string;
  output: OutputState;
  onLibraryChanged: (dir: string) => void;
  onOutputChanged: (patch: Partial<OutputState>) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
  tileSizes: TileSizes;
  onTileSizeChanged: (kind: "pad" | "quick", size: number) => void;
};

export function Settings({
  libraryDir,
  output,
  onLibraryChanged,
  onOutputChanged,
  onRefresh,
  onError,
  tileSizes,
  onTileSizeChanged,
}: Props) {
  // Effective devices: an unset choice means the system default. Checked here so the
  // conflict shows before Preview is pressed.
  const defaultId = output.devices.find((d) => d.isDefault)?.id ?? null;
  const mainId = output.selected ?? defaultId;
  const previewId = output.previewSelected ?? defaultId;
  const previewSame = previewId !== null && previewId === mainId;

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
        <h2>For others</h2>
        <p className="hint">Pick the virtual cable that Discord or your game listens to.</p>
        <select
          className="select-wide"
          value={output.selected ?? ""}
          onChange={async (e) => {
            const name = e.target.value || null;
            try {
              await api.setOutputDevice(name);
              onOutputChanged({ selected: name });
            } catch (err) {
              onError(String(err));
            }
          }}
        >
          <option value="">System default</option>
          {output.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h2>For you</h2>
        <select
          className="select-wide"
          value={output.monitorSelected ?? ""}
          onChange={async (e) => {
            const name = e.target.value || null;
            try {
              await api.setMonitorDevice(name);
              onOutputChanged({ monitorSelected: name });
            } catch (err) {
              onError(String(err));
            }
          }}
        >
          <option value="">Off</option>
          {output.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="inline-field">
          <span>Your volume <output className="value">{Math.round(output.monitorVolume * 100)}%</output></span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={output.monitorVolume}
            disabled={!output.monitorSelected}
            onChange={(e) => {
              const v = Number(e.target.value);
              onOutputChanged({ monitorVolume: v });
              void api.setMonitorVolume(v).catch((err) => onError(String(err)));
            }}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Tile size</h2>
        <p className="hint">Smallest width of a tile. Tiles reflow to fit the window.</p>
        <TileSlider
          label="Soundboard"
          value={tileSizes.pad}
          min={96}
          max={240}
          onChange={(v) => onTileSizeChanged("pad", v)}
        />
        <TileSlider
          label="Quick Panel"
          value={tileSizes.quick}
          min={48}
          max={120}
          onChange={(v) => onTileSizeChanged("quick", v)}
        />
      </section>

      <section className="settings-section">
        <h2>Preview output</h2>
        <p className="hint">
          Headphone previews play here and never on the output above. Must differ from it.
        </p>
        <select
          className="select-wide"
          value={output.previewSelected ?? ""}
          onChange={async (e) => {
            const name = e.target.value || null;
            try {
              await api.setPreviewDevice(name);
              onOutputChanged({ previewSelected: name });
            } catch (err) {
              onError(String(err));
            }
          }}
        >
          <option value="">System default</option>
          {output.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
        {previewSame && (
          <p className="warning" role="alert">
            Preview and main output use the same device. Choose a different preview device.
          </p>
        )}
      </section>

      <AutoRescan onError={onError} onChanged={onRefresh} />

      <CloseToTray onError={onError} />

      <QuickPanelSection onError={onError} />

      <StartupSection onError={onError} />

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

function TileSlider({
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
  return (
    <label className="inline-field">
      <span>
        {label} <output className="value">{value} px</output>
      </span>
      <input type="range" min={min} max={max} step={4} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
