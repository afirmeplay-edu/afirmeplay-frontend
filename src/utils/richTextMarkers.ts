export type RichSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type MarkerKind = "bold" | "italic" | "underline";

const MARKERS: Array<{ kind: MarkerKind; token: string }> = [
  { kind: "bold", token: "**" },
  { kind: "underline", token: "__" },
  { kind: "italic", token: "*" },
];

function findNextMarker(source: string, from: number): { kind: MarkerKind; token: string; index: number } | null {
  let best: { kind: MarkerKind; token: string; index: number } | null = null;
  for (const marker of MARKERS) {
    const index = source.indexOf(marker.token, from);
    if (index === -1) continue;
    if (!best || index < best.index || (index === best.index && marker.token.length > best.token.length)) {
      best = { kind: marker.kind, token: marker.token, index };
    }
  }
  return best;
}

export function stripRichMarkers(text: string): string {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\*/g, "");
}

/** @deprecated use stripRichMarkers */
export function stripBoldMarkers(text: string): string {
  return stripRichMarkers(text);
}

export function parseRichMarkers(text: string): RichSegment[] {
  const source = String(text || "");
  if (!source) return [];

  const segments: RichSegment[] = [];
  let cursor = 0;
  const flags: Record<MarkerKind, boolean> = {
    bold: false,
    italic: false,
    underline: false,
  };

  const pushText = (value: string) => {
    if (!value) return;
    segments.push({
      text: value,
      bold: flags.bold || undefined,
      italic: flags.italic || undefined,
      underline: flags.underline || undefined,
    });
  };

  while (cursor < source.length) {
    const next = findNextMarker(source, cursor);
    if (!next) {
      pushText(source.slice(cursor));
      break;
    }
    if (next.index > cursor) {
      pushText(source.slice(cursor, next.index));
    }
    flags[next.kind] = !flags[next.kind];
    cursor = next.index + next.token.length;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

/** @deprecated use parseRichMarkers */
export function parseBoldMarkers(text: string): RichSegment[] {
  return parseRichMarkers(text);
}

export function truncateText(value: string, maxLength: number): string {
  return stripRichMarkers(value).slice(0, maxLength);
}

export function wrapSelectionWithMarker(
  value: string,
  start: number,
  end: number,
  marker: "**" | "*" | "__"
): { next: string; selectionStart: number; selectionEnd: number } {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const selected = value.slice(safeStart, safeEnd) || "texto";
  const wrapped = `${marker}${selected}${marker}`;
  const next = `${value.slice(0, safeStart)}${wrapped}${value.slice(safeEnd)}`;
  return {
    next,
    selectionStart: safeStart + marker.length,
    selectionEnd: safeStart + marker.length + selected.length,
  };
}
