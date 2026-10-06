/**
 * PDF dos cards de resultados dos alunos (aba Tabelas → visualização Cards).
 * Capa e rodapé seguem o padrão do PDF de ranking; os cards reproduzem o visual do `StudentCard`.
 */
import { jsPDF } from 'jspdf';
import {
  addFootersAllPages,
  addRankingCoverPage,
  isAllSchoolsRankingReport,
  type RankingPdfFilterLabels,
} from '@/services/reports/rankingPdf';
import { normalizeProficiencyLevelLabel, type ReportProficiencyLabel } from '@/utils/report/reportTagStyles';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';

type RGB = [number, number, number];

const C = {
  primary: [124, 62, 237] as RGB,
  headerPurple: [126, 34, 206] as RGB,
  headerTint: [152, 92, 220] as RGB,
  textDark: [31, 41, 55] as RGB,
  textGray: [107, 114, 128] as RGB,
  border: [229, 231, 235] as RGB,
  mutedBg: [248, 248, 250] as RGB,
  profBg: [250, 245, 255] as RGB,
  profBorder: [233, 213, 255] as RGB,
  profValue: [126, 34, 206] as RGB,
  profLabel: [107, 33, 168] as RGB,
  barBg: [237, 233, 243] as RGB,
  white: [255, 255, 255] as RGB,
};

const STATUS_COLORS: Record<'concluida' | 'pendente', RGB> = {
  concluida: [34, 197, 94],
  pendente: [234, 179, 8],
};

const LEVEL_COLORS: Record<ReportProficiencyLabel, RGB> = {
  Avançado: [16, 185, 129],
  Adequado: [34, 197, 94],
  Básico: [234, 179, 8],
  'Abaixo do Básico': [239, 68, 68],
};

const BAR_GRADIENT: RGB[] = [
  [139, 92, 246],
  [168, 85, 247],
  [217, 70, 239],
];

const MARGIN = 15;
const COLS = 2;
const ROWS = 4;
const GAP_X = 6;
const GAP_Y = 4;
const CARD_H = 59;
const HEADER_H = 18;
const SECTION_TOP = 15;
const CARDS_TOP = 27;

export type StudentCardsPdfStudent = {
  nome: string;
  turma?: string;
  escola?: string;
  serie?: string;
  nota: number;
  proficiencia: number;
  classificacao: string;
  status: 'concluida' | 'pendente';
  questoes_respondidas: number;
  acertos: number;
  erros: number;
  totalQuestions: number;
};

type StudentGroup = {
  turma: string;
  escola: string;
  serie: string;
  students: StudentCardsPdfStudent[];
};

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function groupByTurma(students: StudentCardsPdfStudent[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>();
  for (const s of students) {
    const turma = (s.turma || '').trim() || 'Sem turma';
    const escola = (s.escola || '').trim();
    const key = `${escola}||${turma}`;
    let group = map.get(key);
    if (!group) {
      group = { turma, escola, serie: (s.serie || '').trim(), students: [] };
      map.set(key, group);
    }
    group.students.push(s);
  }
  const groups = Array.from(map.values());
  groups.forEach((g) => g.students.sort((a, b) => collator.compare(a.nome, b.nome)));
  groups.sort((a, b) => collator.compare(a.escola, b.escola) || collator.compare(a.turma, b.turma));
  return groups;
}

function fitText(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return `${first}${last}`.toLocaleUpperCase('pt-BR');
}

function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  opts: { fill: RGB; text: RGB; border?: RGB; fontSize?: number; h?: number; bold?: boolean }
): number {
  const h = opts.h ?? 4.4;
  doc.setFontSize(opts.fontSize ?? 6.6);
  doc.setFont('helvetica', opts.bold === false ? 'normal' : 'bold');
  const w = doc.getTextWidth(text) + 3.6;
  doc.setFillColor(...opts.fill);
  if (opts.border) {
    doc.setDrawColor(...opts.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'FD');
  } else {
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  }
  doc.setTextColor(...opts.text);
  doc.text(text, x + 1.8, y + h / 2 + 0.85);
  return w;
}

function lerpColor(stops: RGB[], t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  const local = scaled - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return [
    Math.round(a[0] + (b[0] - a[0]) * local),
    Math.round(a[1] + (b[1] - a[1]) * local),
    Math.round(a[2] + (b[2] - a[2]) * local),
  ];
}

function drawAccuracyBar(doc: jsPDF, x: number, y: number, w: number, h: number, pct: number): void {
  doc.setFillColor(...C.barBg);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  const fillW = (w * Math.max(0, Math.min(100, pct))) / 100;
  if (fillW <= 0) return;
  const steps = Math.max(1, Math.ceil(fillW / 1.2));
  const stepW = fillW / steps;
  for (let i = 0; i < steps; i++) {
    doc.setFillColor(...lerpColor(BAR_GRADIENT, steps === 1 ? 0 : i / (steps - 1)));
    doc.rect(x + i * stepW, y, stepW + 0.05, h, 'F');
  }
}

function drawStatBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  opts: { fill: RGB; border: RGB; value: RGB; label: RGB; valueSize: number; align: 'left' | 'center' }
): void {
  doc.setFillColor(...opts.fill);
  doc.setDrawColor(...opts.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.4, 1.4, 'FD');
  const tx = opts.align === 'center' ? x + w / 2 : x + 2.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(opts.valueSize);
  doc.setTextColor(...opts.value);
  doc.text(value, tx, y + h * 0.5, { align: opts.align });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...opts.label);
  doc.text(label, tx, y + h - 1.6, { align: opts.align });
}

function drawStudentCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  student: StudentCardsPdfStudent,
  subjects: string[]
): void {
  const h = CARD_H;
  const pad = 3;

  doc.setFillColor(...C.white);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  doc.setFillColor(...C.headerPurple);
  doc.roundedRect(x, y, w, HEADER_H, 2, 2, 'F');
  doc.rect(x, y + HEADER_H - 2, w, 2, 'F');

  doc.setFillColor(...C.headerTint);
  doc.circle(x + pad + 3, y + 6.2, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(...C.white);
  doc.text(initials(student.nome), x + pad + 3, y + 7.2, { align: 'center' });

  const turmaLabel = (student.turma || '').trim() || '—';
  doc.setFontSize(6.6);
  const turmaText = fitText(doc, turmaLabel, 22);
  const turmaW = doc.getTextWidth(turmaText) + 3.6;
  drawPill(doc, x + w - pad - turmaW, y + 2.6, turmaText, { fill: C.headerTint, text: C.white });

  const nameX = x + pad + 8;
  const nameMaxW = w - (nameX - x) - turmaW - pad - 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...C.white);
  const wrapped = doc.splitTextToSize((student.nome || '—').trim(), nameMaxW) as string[];
  if (wrapped.length <= 1) {
    doc.text(wrapped[0] ?? '—', nameX, y + 7);
  } else {
    const second = wrapped.slice(1).join(' ');
    doc.text(wrapped[0], nameX, y + 5.6);
    doc.text(fitText(doc, second, nameMaxW), nameX, y + 9.1);
  }

  const status = student.status === 'concluida' ? 'concluida' : 'pendente';
  const level = normalizeProficiencyLevelLabel(student.classificacao);
  let bx = x + pad;
  bx += drawPill(doc, bx, y + 11.8, status === 'concluida' ? 'Concluída' : 'Pendente', {
    fill: STATUS_COLORS[status],
    text: C.white,
  });
  drawPill(doc, bx + 1.5, y + 11.8, level, { fill: LEVEL_COLORS[level], text: C.white });

  const innerX = x + pad;
  const innerW = w - pad * 2;
  let cy = y + HEADER_H + 3;

  const halfW = (innerW - 2) / 2;
  drawStatBox(doc, innerX, cy, halfW, 8.5, formatDecimal1PtBr(student.nota), 'Nota', {
    fill: C.mutedBg,
    border: C.border,
    value: C.textDark,
    label: C.textGray,
    valueSize: 10,
    align: 'left',
  });
  drawStatBox(doc, innerX + halfW + 2, cy, halfW, 8.5, formatDecimal1PtBr(student.proficiencia), 'Proficiência', {
    fill: C.profBg,
    border: C.profBorder,
    value: C.profValue,
    label: C.profLabel,
    valueSize: 10,
    align: 'left',
  });
  cy += 8.5 + 3.6;

  const answered = student.questoes_respondidas || 0;
  const accuracy = answered > 0 ? ((student.acertos || 0) / answered) * 100 : 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textGray);
  doc.text('Acerto', innerX, cy);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(formatPercent1PtBr(accuracy), innerX + innerW, cy, { align: 'right' });
  cy += 1.4;
  drawAccuracyBar(doc, innerX, cy, innerW, 1.6, accuracy);
  cy += 4.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...C.textGray);
  doc.text(`${student.acertos || 0}/${student.totalQuestions}`, innerX + innerW / 2, cy, { align: 'center' });
  cy += 2;

  const thirdW = (innerW - 4) / 3;
  const boxes: Array<[string, string]> = [
    [String(student.acertos || 0), 'Acertos'],
    [String(student.erros || 0), 'Erros'],
    [String(student.totalQuestions), 'Questões'],
  ];
  boxes.forEach(([value, label], i) => {
    drawStatBox(doc, innerX + i * (thirdW + 2), cy, thirdW, 7.5, value, label, {
      fill: C.mutedBg,
      border: C.border,
      value: C.textDark,
      label: C.textGray,
      valueSize: 8.4,
      align: 'center',
    });
  });
  cy += 7.5 + 2.4;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.line(innerX, cy, innerX + innerW, cy);
  cy += 1.6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...C.textGray);
  doc.text('Disciplinas', innerX, cy + 3.35);
  let px = innerX + doc.getTextWidth('Disciplinas') + 2;
  const pillMax = innerX + innerW;
  const shown = subjects.slice(0, 2);
  for (const subject of shown) {
    doc.setFontSize(6);
    const label = fitText(doc, subject, 28);
    if (px + doc.getTextWidth(label) + 3.6 > pillMax) break;
    px +=
      drawPill(doc, px, cy + 0.6, label, {
        fill: C.mutedBg,
        text: C.textDark,
        border: C.border,
        fontSize: 6,
        h: 3.8,
        bold: false,
      }) + 1.2;
  }
  if (subjects.length > 2) {
    drawPill(doc, px, cy + 0.6, `+${subjects.length - 2}`, {
      fill: C.mutedBg,
      text: C.textDark,
      border: C.border,
      fontSize: 6,
      h: 3.8,
      bold: false,
    });
  }

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
}

function drawSectionHeader(doc: jsPDF, group: StudentGroup, continuation: boolean): void {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.primary);
  doc.rect(MARGIN, SECTION_TOP - 4, 1.4, 9.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...C.primary);
  const title = `Turma ${group.turma}${continuation ? ' (continuação)' : ''}`;
  doc.text(fitText(doc, title, pageW - MARGIN * 2 - 40), MARGIN + 4, SECTION_TOP);

  const count = group.students.length;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textGray);
  doc.text(`${count} aluno${count === 1 ? '' : 's'}`, pageW - MARGIN, SECTION_TOP, { align: 'right' });

  const details = [group.escola, group.serie].filter(Boolean).join(' · ');
  if (details) {
    doc.text(fitText(doc, details, pageW - MARGIN * 2 - 4), MARGIN + 4, SECTION_TOP + 4.6);
  }

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, SECTION_TOP + 7.5, pageW - MARGIN, SECTION_TOP + 7.5);
}

function safeFileName(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'resultados-alunos'
  );
}

export async function generateStudentCardsPdf(opts: {
  escopoTitulo?: string;
  filterLabels: RankingPdfFilterLabels;
  students: StudentCardsPdfStudent[];
  subjects: string[];
  cityId?: string | null;
  fileNameBase?: string;
}): Promise<void> {
  const filters = opts.filterLabels;
  const cardLines: Array<{ label: string; value: string }> = [
    { label: 'AVALIAÇÃO', value: (opts.escopoTitulo ?? '').trim() || '—' },
    { label: 'ESTADO', value: filters.estado },
    { label: 'MUNICÍPIO', value: filters.municipio },
    { label: 'ESCOLA', value: filters.escola },
  ];
  if (!isAllSchoolsRankingReport(filters.escola)) {
    cardLines.push({ label: 'SÉRIE', value: filters.serie }, { label: 'TURMA', value: filters.turma });
    if (filters.turno?.trim() && filters.turma !== 'Todas') {
      cardLines.push({ label: 'TURNO', value: filters.turno });
    }
  }
  if (filters.alunos?.trim()) {
    cardLines.push({ label: 'ALUNOS', value: filters.alunos });
  }
  cardLines.push({ label: 'TOTAL DE ALUNOS', value: String(opts.students.length) });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await addRankingCoverPage(
    pdf,
    'RESULTADOS DOS ALUNOS',
    'Desempenho individual por aluno',
    'RESULTADOS',
    'Resultados de avaliações online',
    cardLines,
    opts.cityId ?? null
  );

  const pageW = pdf.internal.pageSize.getWidth();
  const cardW = (pageW - MARGIN * 2 - GAP_X * (COLS - 1)) / COLS;
  const perPage = COLS * ROWS;

  for (const group of groupByTurma(opts.students)) {
    for (let start = 0; start < group.students.length; start += perPage) {
      pdf.addPage();
      drawSectionHeader(pdf, group, start > 0);
      group.students.slice(start, start + perPage).forEach((student, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        drawStudentCard(
          pdf,
          MARGIN + col * (cardW + GAP_X),
          CARDS_TOP + row * (CARD_H + GAP_Y),
          cardW,
          student,
          opts.subjects
        );
      });
    }
  }

  addFootersAllPages(pdf);

  const base = safeFileName(opts.fileNameBase ?? 'resultados-alunos');
  pdf.save(`${base}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
