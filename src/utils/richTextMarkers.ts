export type RichSegment = { text: string; bold: boolean };

const BOLD_MARKER = "**";

export function stripBoldMarkers(text: string): string {
  return String(text || "").replace(/\*\*/g, "");
}

export function parseBoldMarkers(text: string): RichSegment[] {
  const source = String(text || "");
  if (!source) return [];

  const segments: RichSegment[] = [];
  let cursor = 0;
  let bold = false;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(BOLD_MARKER, cursor);
    if (markerIndex === -1) {
      const tail = source.slice(cursor);
      if (tail) segments.push({ text: tail, bold });
      break;
    }

    if (markerIndex > cursor) {
      segments.push({ text: source.slice(cursor, markerIndex), bold });
    }

    bold = !bold;
    cursor = markerIndex + BOLD_MARKER.length;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

export function truncateText(value: string, maxLength: number): string {
  return stripBoldMarkers(value).slice(0, maxLength);
}
