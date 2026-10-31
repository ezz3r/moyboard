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
