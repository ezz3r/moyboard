import { useEffect, useState } from "react";
import { api, pickFolder } from "../api";
import type { AppSettings, OutputState } from "../types";

type Props = {
  libraryDir: string;
  output: OutputState;
  onLibraryChanged: (dir: string) => void;
  onOutputChanged: (patch: Partial<OutputState>) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
};

export function Settings({ libraryDir, output, onLibraryChanged, onOutputChanged, onRefresh, onError }: Props) {
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
        <h2>Output device</h2>
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
            <option key={d.name} value={d.name}>
              {d.name}
              {d.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h2>Monitor output</h2>
        <p className="hint">Plays each sound here too, for example your headphones. Must differ from the output above.</p>
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
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="inline-field">
          <span>Monitor volume <output className="value">{Math.round(output.monitorVolume * 100)}%</output></span>
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
            <option key={d.name} value={d.name}>
              {d.name}
              {d.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </section>

      <AutoRescan onError={onError} onChanged={onRefresh} />

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
            setSettings({ autoRescan: enabled });
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
