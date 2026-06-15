/**
 * Formata data de aplicação para exibição no PDF.
 * A API pode enviar DD/MM/YYYY (não parseável por `new Date`) ou ISO.
 */
export function formatApplicationDateForPdf(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  if (!v) return "";

  const brMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    let year = brMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return v;
}
