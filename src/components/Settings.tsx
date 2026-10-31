import { useState } from "react";
import { api, pickFolder } from "../api";
import type { OutputState, SoundEntry } from "../types";

type Props = {
  libraryDir: string;
  output: OutputState;
  categories: string[];
  sounds: SoundEntry[];
  onLibraryChanged: (dir: string) => void;
  onOutputChanged: (name: string | null) => void;
  onCategoriesChanged: () => void;
  onError: (message: string) => void;
};

export function Settings({
  libraryDir,
  output,
  categories,
  sounds,
  onLibraryChanged,
  onOutputChanged,
  onCategoriesChanged,
  onError,
}: Props) {
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
              onCategoriesChanged();
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
              onOutputChanged(name);
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

      <CategoryList
        categories={categories}
        sounds={sounds}
        onChanged={onCategoriesChanged}
        onError={onError}
      />
    </div>
  );
}

function CategoryList({
  categories,
  sounds,
  onChanged,
  onError,
}: {
  categories: string[];
  sounds: SoundEntry[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  return (
    <section className="settings-section">
      <h2>Categories</h2>
      {categories.length === 0 && <p className="hint">No categories yet. Set one on any sound.</p>}
      <ul className="cat-list">
        {categories.map((c) => (
          <CategoryRow
            key={c}
            name={c}
            count={sounds.filter((s) => s.meta.category === c).length}
            onRename={async (to) => {
              try {
                for (const s of sounds.filter((x) => x.meta.category === c)) {
                  await api.setSoundMeta(s.fileName, { ...s.meta, category: to });
                }
                onChanged();
              } catch (e) {
                onError(String(e));
              }
            }}
            onDelete={async () => {
              try {
                for (const s of sounds.filter((x) => x.meta.category === c)) {
                  await api.setSoundMeta(s.fileName, { ...s.meta, category: null });
                }
                onChanged();
              } catch (e) {
                onError(String(e));
              }
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function CategoryRow({
  name,
  count,
  onRename,
  onDelete,
}: {
  name: string;
  count: number;
  onRename: (to: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const to = draft.trim();
    if (to && to !== name) onRename(to);
    else setDraft(name);
  };
  return (
    <li className="cat-row">
      <input
        aria-label={`Category name, ${count} sounds`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="count">{count}</span>
      <button type="button" className="btn btn-quiet" onClick={onDelete}>
        Remove
      </button>
    </li>
  );
}
