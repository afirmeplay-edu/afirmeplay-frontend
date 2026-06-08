import type { InstrumentPickerItem, InstrumentPickerSeriesOption } from "./InstrumentPickerModal";

type RawInstrument = {
  id: string;
  titulo?: string;
  nome?: string;
  name?: string;
  label?: string;
  disciplina?: string;
  disciplinas?: string[];
};

function resolveDisciplinaBadges(item: RawInstrument): string[] {
  const fromList = (item.disciplinas ?? []).map((d) => d.trim()).filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = item.disciplina?.trim();
  return single ? [single] : [];
}

type RawSeries = {
  id: string;
  nome?: string;
  name?: string;
};

export function toInstrumentPickerItems(items: RawInstrument[]): InstrumentPickerItem[] {
  return items.map((item) => {
    const badges = resolveDisciplinaBadges(item);
    return {
      id: item.id,
      label: item.label ?? item.titulo ?? item.nome ?? item.name ?? "—",
      badges,
      badge: badges[0],
      subtitle: badges.length > 1 ? badges.join(" · ") : badges[0],
    };
  });
}

export function toInstrumentPickerSeries(items: RawSeries[]): InstrumentPickerSeriesOption[] {
  return items.map((item) => ({
    id: item.id,
    name: item.nome ?? item.name ?? "—",
  }));
}

export type InstrumentPickerContextInput = {
  estado?: string;
  municipio?: string;
  escola?: string;
  periodo?: string;
};

/** Linhas de contexto exibidas no modal (filtros já selecionados na página). */
export function buildPickerContextLines(
  labels: InstrumentPickerContextInput
): string[] {
  const lines: string[] = [];
  if (labels.estado?.trim()) lines.push(`Estado: ${labels.estado.trim()}`);
  if (labels.municipio?.trim()) lines.push(`Município: ${labels.municipio.trim()}`);
  if (labels.escola?.trim()) lines.push(`Escola: ${labels.escola.trim()}`);
  if (labels.periodo?.trim()) lines.push(`Período: ${labels.periodo.trim()}`);
  return lines;
}
