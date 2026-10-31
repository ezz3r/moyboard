/** "airhorn.mp3" -> "airhorn". */
export function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** "airhorn.mp3" -> ".mp3"; no extension -> "". */
export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

/** "Ctrl+Shift+KeyX" -> "Ctrl+Shift+X"; "Ctrl+Backquote" -> "Ctrl+`". Display only. */
export function hotkeyLabel(hotkey: string): string {
  return hotkey
    .split("+")
    .map((part) => part.replace(/^(Key|Digit)/, "").replace("Backquote", "`").replace("Backslash", "\\"))
    .join("+");
}
