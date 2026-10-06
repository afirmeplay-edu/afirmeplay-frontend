/**
 * PDF do cronograma de Logística de Avaliação.
 * Identidade visual alinhada a participationReportPdf (faixa superior, títulos de seção, rodapé).
 */
import { jsPDF } from 'jspdf';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import type { LogisticsSchedule, LogisticsScheduleItem } from '@/types/logistics';

export type LogisticsPdfOrientation = 'portrait' | 'landscape';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  bgTotal: [237, 233, 254] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  draftBg: [254, 243, 199] as [number, number, number],
  draftText: [146, 64, 14] as [number, number, number],
  cancelBg: [254, 226, 226] as [number, number, number],
  cancelText: [153, 27, 27] as [number, number, number],
};

const MARGIN = 12;
const TOP_BAND_H = 16;
const CONTENT_TOP = TOP_BAND_H + 8;
const BOTTOM_LIMIT = 16;

/** Proporção de cada coluna sobre a largura útil (soma = 1). */
const COLUMN_RATIOS = {
  portrait: [0.14, 0.11, 0.1, 0.08, 0.08, 0.09, 0.15, 0.25],
  landscape: [0.13, 0.1, 0.09, 0.07, 0.07, 0.08, 0.13, 0.33],
} as const;

function fmtNow(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtNumber(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR');
}

function fmtDate(iso?: string | null, withWeekday = false): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), withWeekday ? 'dd/MM/yyyy (EEE)' : 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return iso;
  }
}

function evaluationModeLabel(mode?: string | null): string {
  if (mode === 'physical') return 'Impressa (caderno)';
  if (mode === 'subjective') return 'Subjetiva (impressa)';
  return 'Online (tablet)';
}

function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cronograma'
  );
}

function tableFinalY(doc: jsPDF, fallback: number): number {
  const ly = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return typeof ly === 'number' ? ly : fallback;
}

function statusSuffix(status: LogisticsSchedule['status']): string {
  if (status === 'rascunho') return ' — RASCUNHO';
  if (status === 'cancelado') return ' — CANCELADO';
  return '';
}

function drawTopBand(doc: jsPDF, title: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, TOP_BAND_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text(title.toUpperCase(), pageW / 2, 10.5, { align: 'center' });
}

function ensureSpace(doc: jsPDF, y: number, needed: number, bandTitle: string): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - BOTTOM_LIMIT) {
    doc.addPage();
    drawTopBand(doc, bandTitle);
    return CONTENT_TOP;
  }
  return y;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string, bandTitle: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = ensureSpace(doc, y, 24, bandTitle);
  doc.setFillColor(...C.primary);
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 8.5, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.white);
  const maxW = pageW - MARGIN * 2 - 8;
  const text = doc.splitTextToSize(title, maxW)[0] ?? title;
  doc.text(text, MARGIN + 4, y + 5.8);
  return y + 11;
}

function addFooters(doc: jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, pageH - 11, pageW - MARGIN, pageH - 11);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text('AfirmePlay: Sistema de Ensino e Avaliação', MARGIN, pageH - 7);
    doc.text(`Página ${i} de ${n}`, pageW / 2, pageH - 7, { align: 'center' });
    doc.text(`Gerado em ${dataGeracao}`, pageW - MARGIN, pageH - 7, { align: 'right' });
  }
}

function groupBySchool(items: LogisticsScheduleItem[]) {
  const groups = new Map<string, { name: string; items: LogisticsScheduleItem[] }>();
  for (const item of items) {
    const key = item.school_id;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { name: item.school_name || '—', items: [item] });
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function sumItems(items: LogisticsScheduleItem[]) {
  return items.reduce(
    (acc, i) => ({
      students: acc.students + (i.students_count || 0),
      tablets: acc.tablets + (i.tablets_qty || 0),
      booklets: acc.booklets + (i.booklets_qty || 0),
    }),
    { students: 0, tablets: 0, booklets: 0 }
  );
}

async function drawHeaderBlock(
  doc: jsPDF,
  schedule: LogisticsSchedule,
  cityName: string,
  cityId: string | null,
  dataGeracao: string
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  let y = CONTENT_TOP;

  let logoW = 0;
  try {
    const { logo } = await loadCityBrandingForReportPdf(cityId);
    if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
      const h = 16;
      const w = Math.min(40, (logo.iw * h) / logo.ih);
      doc.addImage(logo.dataUrl, 'PNG', pageW - MARGIN - w, y - 2, w, (logo.ih * w) / logo.iw);
      logoW = w + 4;
    }
  } catch {
    // sem logo
  }

  const textMaxW = pageW - MARGIN * 2 - logoW;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.textDark);
  const titleLines = doc.splitTextToSize(schedule.title || 'Cronograma de aplicação', textMaxW);
  doc.text(titleLines, MARGIN, y + 4);
  y += 4 + titleLines.length * 5.5;

  const lines: Array<[string, string]> = [
    ['Avaliação', schedule.test_title || '—'],
    ['Município', cityName || '—'],
    ['Modalidade', evaluationModeLabel(schedule.evaluation_mode)],
    ['Status', schedule.status === 'publicado' ? `Publicado em ${fmtDate(schedule.published_at)}` : schedule.status === 'cancelado' ? 'Cancelado' : 'Rascunho'],
    ['Gerado em', dataGeracao],
  ];
  doc.setFontSize(9);
  for (const [label, value] of lines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const valueLines = doc.splitTextToSize(value, textMaxW - 24);
    doc.text(valueLines, MARGIN + 24, y);
    y += Math.max(1, valueLines.length) * 4.6;
  }
  y += 2;

  if (schedule.status !== 'publicado') {
    const isDraft = schedule.status === 'rascunho';
    const bg = isDraft ? C.draftBg : C.cancelBg;
    const fg = isDraft ? C.draftText : C.cancelText;
    const msg = isDraft
      ? 'RASCUNHO — cronograma ainda não publicado. Datas e quantidades podem mudar.'
      : `CANCELADO${schedule.cancelled_at ? ` em ${fmtDate(schedule.cancelled_at)}` : ''} — esta aplicação não ocorrerá conforme abaixo.`;
    doc.setFillColor(...bg);
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 9, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...fg);
    doc.text(msg, pageW / 2, y + 5.9, { align: 'center' });
    y += 13;
  }

  if (schedule.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text('Observação:', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const noteLines = doc.splitTextToSize(schedule.notes, pageW - MARGIN * 2 - 24);
    doc.text(noteLines, MARGIN + 24, y);
    y += noteLines.length * 4.6 + 2;
  }

  return y + 2;
}

function drawSummary(doc: jsPDF, y: number, items: LogisticsScheduleItem[], bandTitle: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const totals = sumItems(items);
  const dates = Array.from(new Set(items.map((i) => i.scheduled_date).filter(Boolean) as string[])).sort();
  const period =
    dates.length === 0 ? '—' : dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0])} a ${fmtDate(dates[dates.length - 1])}`;
  const cards: Array<[string, string]> = [
    ['Escolas', fmtNumber(new Set(items.map((i) => i.school_id)).size)],
    ['Turmas', fmtNumber(items.length)],
    ['Alunos', fmtNumber(totals.students)],
    ['Tablets', fmtNumber(totals.tablets)],
    ['Cadernos', fmtNumber(totals.booklets)],
    ['Período', period],
  ];

  y = ensureSpace(doc, y, 18, bandTitle);
  const gap = 3;
  const cardW = (pageW - MARGIN * 2 - gap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value], idx) => {
    const x = MARGIN + idx * (cardW + gap);
    doc.setFillColor(...C.bgLight);
    doc.setDrawColor(...C.borderLight);
    doc.roundedRect(x, y, cardW, 14, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.text(label.toUpperCase(), x + cardW / 2, y + 4.8, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(label === 'Período' ? 8 : 11);
    doc.setTextColor(...C.textDark);
    const valueText = doc.splitTextToSize(value, cardW - 3)[0] ?? value;
    doc.text(valueText, x + cardW / 2, y + 10.8, { align: 'center' });
  });
  return y + 19;
}

export async function generateLogisticsPdf(opts: {
  schedule: LogisticsSchedule;
  orientation: LogisticsPdfOrientation;
  cityName: string;
  cityId: string | null;
}): Promise<void> {
  const { schedule, orientation, cityName, cityId } = opts;
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - MARGIN * 2;
  const dataGeracao = fmtNow();
  const bandTitle = `Logística de Avaliação${statusSuffix(schedule.status)}`;
  const items = schedule.items ?? [];

  const widths = COLUMN_RATIOS[orientation].map((r) => r * usableW);
  const columnStyles = {
    0: { cellWidth: widths[0], halign: 'left' as const },
    1: { cellWidth: widths[1], halign: 'left' as const },
    2: { cellWidth: widths[2], halign: 'left' as const },
    3: { cellWidth: widths[3], halign: 'right' as const },
    4: { cellWidth: widths[4], halign: 'right' as const },
    5: { cellWidth: widths[5], halign: 'right' as const },
    6: { cellWidth: widths[6], halign: 'center' as const },
    7: { cellWidth: widths[7], halign: 'left' as const },
  };
  const tableBase = {
    theme: 'grid' as const,
    margin: { top: CONTENT_TOP, left: MARGIN, right: MARGIN, bottom: BOTTOM_LIMIT },
    styles: {
      font: 'helvetica',
      fontSize: orientation === 'landscape' ? 8.5 : 8,
      cellPadding: 1.8,
      textColor: C.textDark,
      lineColor: C.borderLight,
      lineWidth: 0.2,
      overflow: 'linebreak' as const,
    },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold' as const, halign: 'center' as const },
    footStyles: { fillColor: C.bgTotal, textColor: C.textDark, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: C.bgLight },
    rowPageBreak: 'avoid' as const,
    didDrawPage: () => drawTopBand(doc, bandTitle),
  };

  drawTopBand(doc, bandTitle);
  let y = await drawHeaderBlock(doc, schedule, cityName, cityId, dataGeracao);
  y = drawSummary(doc, y, items, bandTitle);

  const head = [['Série', 'Turma', 'Turno', 'Alunos', 'Tablets', 'Cadernos', 'Data', 'Observação']];
  const groups = groupBySchool(items);

  if (groups.length === 0) {
    y = drawSectionTitle(doc, y, 'Turmas', bandTitle);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text('Nenhuma turma neste cronograma.', MARGIN, y + 4);
  }

  for (const group of groups) {
    const t = sumItems(group.items);
    y = drawSectionTitle(
      doc,
      y,
      `${group.name} — ${group.items.length} turma(s), ${fmtNumber(t.students)} aluno(s)`,
      bandTitle
    );
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head,
      body: group.items.map((i) => [
        i.grade_name || '—',
        i.class_name || '—',
        i.shift || '—',
        fmtNumber(i.students_count),
        fmtNumber(i.tablets_qty),
        fmtNumber(i.booklets_qty),
        fmtDate(i.scheduled_date, true),
        i.notes || '',
      ]),
      foot: [
        [
          { content: 'Total da escola', colSpan: 3, styles: { halign: 'left' } },
          { content: fmtNumber(t.students), styles: { halign: 'right' } },
          { content: fmtNumber(t.tablets), styles: { halign: 'right' } },
          { content: fmtNumber(t.booklets), styles: { halign: 'right' } },
          { content: '', colSpan: 2 },
        ],
      ],
      showFoot: 'lastPage',
      columnStyles,
    });
    y = tableFinalY(doc, y) + 7;
  }

  if (groups.length > 0) {
    const g = sumItems(items);
    y = drawSectionTitle(doc, y, 'Total geral', bandTitle);
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [['Escolas', 'Turmas', 'Alunos', 'Tablets', 'Cadernos']],
      body: [
        [
          fmtNumber(groups.length),
          fmtNumber(items.length),
          fmtNumber(g.students),
          fmtNumber(g.tablets),
          fmtNumber(g.booklets),
        ],
      ],
      bodyStyles: { halign: 'center', fontStyle: 'bold' },
      columnStyles: {},
    });
  }

  addFooters(doc, dataGeracao);
  const suffix = schedule.status === 'publicado' ? '' : `-${schedule.status}`;
  doc.save(`logistica-${slug(schedule.title || schedule.test_title || '')}${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
