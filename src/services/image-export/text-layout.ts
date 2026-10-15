// Match normal word wrapping, with an anywhere fallback for a word that cannot
// fit on one line. Never squeeze text horizontally to make it fit.
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
  maxLines = Infinity,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    for (const character of word) {
      if (line && measure(line + character) > width) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible.at(-1) ?? '';
  while (last && measure(last + '…') > width) last = Array.from(last).slice(0, -1).join('');
  visible[visible.length - 1] = last + '…';
  return visible;
}
