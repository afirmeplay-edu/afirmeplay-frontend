type ZipEntry = {
  path: string;
  blob: Blob;
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function sanitizePathSegment(value: string | null | undefined, fallback = "SemNome"): string {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 80);
}

export function buildHierarchyPath(params: {
  escola: string | null | undefined;
  serie: string | null | undefined;
  turma: string | null | undefined;
  fileName: string;
}): string {
  const escola = sanitizePathSegment(params.escola, "Escola");
  const serie = sanitizePathSegment(params.serie, "Serie");
  const turma = sanitizePathSegment(params.turma, "Turma");
  const fileName = sanitizePathSegment(params.fileName, "arquivo.pdf");
  return `${escola}/${serie}/${turma}/${fileName}`;
}

export async function generateZipBlob(
  entries: ZipEntry[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  entries.forEach((entry, index) => {
    onProgress?.(index + 1, entries.length);

    let uniquePath = entry.path;
    let suffix = 2;
    while (usedPaths.has(uniquePath)) {
      uniquePath = uniquePath.replace(/\.pdf$/i, `-${suffix}.pdf`);
      suffix += 1;
    }
    usedPaths.add(uniquePath);
    zip.file(uniquePath, entry.blob);
  });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
