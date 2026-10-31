// Loaded only when the icon popover opens (see EmojiField), so startup does not pay for the emoji data.
import { useEffect, useRef } from "react";
import { Picker } from "emoji-mart";
import data from "@emoji-mart/data";

type Props = { onPick: (native: string) => void };

/**
 * Full Unicode emoji set with search, offline. `set: "native"` draws the system emoji font,
 * so there are no image sprites. The colours follow the app's tokens.
 */
export default function EmojiPicker({ onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onPick);
  latest.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // The typings describe the element loosely; at runtime it is a plain custom element.
    const picker = new Picker({
      data,
      set: "native",
      theme: "dark",
      locale: "en",
      previewPosition: "none",
      skinTonePosition: "search",
      perLine: 8,
      dynamicWidth: true,
      maxFrequentRows: 2,
      autoFocus: true,
      onEmojiSelect: (e: { native: string }) => latest.current(e.native),
    }) as unknown as HTMLElement;
    el.appendChild(picker);
    return () => picker.remove();
  }, []);

  return <div ref={host} className="emoji-host" />;
}
