import { useState } from "react";
import { api } from "../api";
import { Swatches } from "./Swatches";
import type { CategoryMeta } from "../types";

type Props = {
  id: string;
  /** Saved entry, or undefined for a legacy category that only exists on its sounds. */
  category: CategoryMeta | undefined;
  count: number;
  onChanged: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

/** Sidebar editor for one category: name, colour, delete. Saves on each change. */
export function CategoryPanel({ id, category, count, onChanged, onDeleted, onError }: Props) {
  const name = category?.name ?? id;
  const color = category?.color ?? null;
  const [draft, setDraft] = useState(name);

  async function save(patch: Partial<CategoryMeta>) {
    try {
      await api.setCategory(id, patch.name ?? name, patch.color === undefined ? color : patch.color);
      onChanged();
    } catch (e) {
      onError(String(e));
      setDraft(name);
    }
  }

  return (
    <div className="panel">
      <label className="field">
        <span>Category name</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next && next !== name) void save({ name: next });
            else setDraft(name);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <div className="field">
        <span>Colour for all sounds in this category</span>
        <Swatches
          label="Category colour"
          value={color}
          inheritLabel="No colour"
          onChange={(c) => void save({ color: c })}
        />
      </div>

      <p className="hint">{count === 1 ? "1 sound" : `${count} sounds`}. Sounds keep their colour if they set their own.</p>

      <div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            try {
              await api.deleteCategory(id);
              onDeleted();
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          Delete category
        </button>
        <p className="hint">Its sounds move to Uncategorized. The files stay.</p>
      </div>
    </div>
  );
}
