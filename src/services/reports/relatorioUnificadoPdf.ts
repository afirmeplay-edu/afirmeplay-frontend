/**
 * PDF do Relatório Unificado — jsPDF + jspdf-autotable (mesmas libs dos relatórios).
 * Logo via `@/utils/pdfCityBranding` (sem alterar geradores existentes).
 *
 * Limite de fonte do corpo: máximo 8 pt, mínimo **6 pt**.
 * Com ~14 mm por subcoluna em A4 paisagem, cabem tipicamente **até 3 disciplinas**
 * por bloco (Aluno + Nível + Alfabetizado + Geral fixos em todos os blocos).
 */
import { jsPDF } from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import {
  ICA_LEVELS,
  ICA_TO_PERFIL_LEITOR,
  PERFIL_ALFABETOMETRO_LABEL,
  getPerfilLeitorStyle,
  type PerfilLeitorCode,
} from '@/lib/colors/reading-levels';
import type {
  RelatorioUnificadoAluno,
  RelatorioUnificadoDados,
  RelatorioUnificadoMetricas,
  RelatorioUnificadoReportFlow,
} from '@/types/relatorio-unificado';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bgHeader: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  mutedFill: [243, 244, 246] as [number, number, number],
};

const CLASSIF_FILL: Record<string, [number, number, number]> = {
  'Abaixo do Básico': [254, 226, 226],
  Básico: [254, 249, 195],
  Adequado: [220, 252, 231],
  Avançado: [22, 101, 52],
};

const CLASSIF_TEXT: Record<string, [number, number, number]> = {
  'Abaixo do Básico': [153, 27, 27],
  Básico: [133, 77, 14],
  Adequado: [22, 101, 52],
  Avançado: [236, 253, 245],
};

const MARGIN = 10;
export const RELATORIO_UNIFICADO_PDF_BODY_FONT_MAX = 8;
export const RELATORIO_UNIFICADO_PDF_BODY_FONT_MIN = 6;
const MIN_METRIC_COL_MM = 14;
const ALUNO_COL_MM = 38;
const NIVEL_COL_MM = 28;
const ALFAB_COL_MM = 18;

export type RelatorioUnificadoPdfOptions = {
  report: RelatorioUnificadoDados;
  escopoSubtitulo: string;
  flow: RelatorioUnificadoReportFlow;
  cityId: string | null;
  escolaNome?: string;
  turmaNome?: string;
};

type Disc = { id: string; nome: string };

type StyleHint =
  | { kind: 'classif'; label: string }
  | { kind: 'nivel'; code: string }
  | { kind: 'alfab'; value: 'sim' | 'nao' | 'na' }
  | { kind: 'muted' }
  | { kind: 'plain' };

function fmtNow(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function slugify(raw: string | undefined | null): string {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || 'sem';
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeClassif(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const lower = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (lower.includes('avancado')) return 'Avançado';
  if (lower.includes('adequado')) return 'Adequado';
  if (lower.includes('abaixo')) return 'Abaixo do Básico';
  if (lower === 'basico' || lower.startsWith('basico')) return 'Básico';
  return t;
}

function scaledLogo(iw: number, ih: number, maxW: number, maxH: number) {
  if (iw <= 0 || ih <= 0) return { w: maxW, h: maxH * 0.5 };
  let w = maxW;
  let h = (ih * w) / iw;
  if (h > maxH) {
    h = maxH;
    w = (iw * h) / ih;
  }
  return { w, h };
}

function usableWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - MARGIN * 2;
}

function maxDisciplinasPerBlock(doc: jsPDF): number {
  const fixed = ALUNO_COL_MM + NIVEL_COL_MM + ALFAB_COL_MM + MIN_METRIC_COL_MM * 3;
  const remain = usableWidth(doc) - fixed;
  return Math.max(1, Math.floor(remain / (MIN_METRIC_COL_MM * 3)));
}

function metricTriplet(m: RelatorioUnificadoMetricas | undefined | null): [string, string, string] {
  if (!m) return ['—', '—', '—'];
  return [
    formatMetric(m.proficiencia),
    formatMetric(m.nota),
    m.classificacao?.trim() || '—',
  ];
}

function c(content: string, extra?: Record<string, unknown>) {
  return {
    content,
    styles: { halign: 'center' as const, valign: 'middle' as const, ...(extra || {}) },
  };
}

function buildBody(
  alunos: RelatorioUnificadoAluno[],
  discSlice: Disc[]
): { body: unknown[][]; hints: StyleHint[][] } {
  const body: unknown[][] = [];
  const hints: StyleHint[][] = [];
  const provaCols = 3 + discSlice.length * 3;

  for (const aluno of alunos) {
    const nome = `${aluno.nome}\n${aluno.turmaNome || '—'}`;
    const rowHints: StyleHint[] = [];

    const nivelText = aluno.semLeitura
      ? 'não avaliado'
      : aluno.nivelLeituraLabel || aluno.nivelLeitura || 'não avaliado';
    const alfabText = aluno.semLeitura
      ? 'não avaliado'
      : aluno.alfabetizado === null
        ? 'não avaliado'
        : aluno.alfabetizado
          ? 'Sim'
          : 'Não';

    rowHints.push({ kind: 'plain' });
    if (aluno.semLeitura) {
      rowHints.push({ kind: 'muted' }, { kind: 'muted' });
    } else {
      rowHints.push(
        aluno.nivelLeitura
          ? { kind: 'nivel', code: aluno.nivelLeitura }
          : { kind: 'muted' }
      );
      rowHints.push(
        aluno.alfabetizado === true
          ? { kind: 'alfab', value: 'sim' }
          : aluno.alfabetizado === false
            ? { kind: 'alfab', value: 'nao' }
            : { kind: 'muted' }
      );
    }

    if (aluno.semProva) {
      body.push([
        { content: nome, styles: { halign: 'left', valign: 'middle' } },
        c(nivelText, aluno.semLeitura ? { textColor: C.textGray } : {}),
        c(
          alfabText,
          aluno.semLeitura || aluno.alfabetizado === null ? { textColor: C.textGray } : {}
        ),
        {
          content: 'Não fez a avaliação',
          colSpan: provaCols,
          styles: {
            halign: 'center',
            valign: 'middle',
            textColor: C.textGray,
            fontStyle: 'italic',
          },
        },
      ]);
      // fix left align / halign below
      hints.push(rowHints);
      continue;
    }

    const [gp, gn, gc] = metricTriplet(aluno.geral);
    const gClass = normalizeClassif(aluno.geral?.classificacao);
    rowHints.push({ kind: 'plain' }, { kind: 'plain' });
    rowHints.push(gClass ? { kind: 'classif', label: gClass } : { kind: 'muted' });

    const cells: unknown[] = [
      { content: nome, styles: { halign: 'left', valign: 'middle' } },
      c(nivelText, aluno.semLeitura ? { textColor: C.textGray } : {}),
      c(
        alfabText,
        aluno.semLeitura || aluno.alfabetizado === null ? { textColor: C.textGray } : {}
      ),
      c(gp),
      c(gn),
      c(gc),
    ];

    for (const d of discSlice) {
      const [p, n, cl] = metricTriplet(aluno.porDisciplina?.[d.id]);
      const cNorm = normalizeClassif(aluno.porDisciplina?.[d.id]?.classificacao);
      cells.push(c(p), c(n), c(cl));
      rowHints.push({ kind: 'plain' }, { kind: 'plain' });
      rowHints.push(cNorm ? { kind: 'classif', label: cNorm } : { kind: 'muted' });
    }

    body.push(cells);
    hints.push(rowHints);
  }

  // Normalize halign typos to halign→halign by post-processing
  for (const row of body) {
    for (const cell of row) {
      if (cell && typeof cell === 'object' && 'styles' in cell) {
        const st = (cell as { styles: Record<string, unknown> }).styles;
        if ('halign' in st) {
          st.halign = st.halign;
          delete st.halign;
        }
      }
    }
  }

  return { body, hints };
}

function headRows(discSlice: Disc[]): unknown[][] {
  const top: unknown[] = [
    { content: 'Aluno', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    { content: 'Nível de leitura', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    { content: 'Alfabetizado', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    { content: 'Geral', colSpan: 3, styles: { halign: 'center' } },
  ];
  for (const d of discSlice) {
    top.push({ content: d.nome, colSpan: 3, styles: { halign: 'center' } });
  }
  for (const cell of top) {
    if (cell && typeof cell === 'object' && 'styles' in cell) {
      const st = (cell as { styles: Record<string, unknown> }).styles;
      if ('halign' in st) {
        st.halign = st.halign;
        delete st.halign;
      }
    }
  }
  const sub: string[] = [];
  for (let i = 0; i < 1 + discSlice.length; i++) {
    sub.push('Proficiência', 'Nota', 'Classificação');
  }
  return [top, sub];
}

function columnStyles(discSlice: Disc[]): Record<number, { cellWidth: number }> {
  const styles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: ALUNO_COL_MM },
    1: { cellWidth: NIVEL_COL_MM },
    2: { cellWidth: ALFAB_COL_MM },
  };
  let idx = 3;
  for (let g = 0; g < 1 + discSlice.length; g++) {
    styles[idx++] = { cellWidth: MIN_METRIC_COL_MM };
    styles[idx++] = { cellWidth: MIN_METRIC_COL_MM };
    styles[idx++] = { cellWidth: MIN_METRIC_COL_MM };
  }
  return styles;
}

function applyCellStyles(data: CellHookData, hints: StyleHint[][]): void {
  if (data.section !== 'body') return;
  const hint = hints[data.row.index]?.[data.column.index];
  if (!hint) return;
  if (hint.kind === 'classif') {
    data.cell.styles.fillColor = CLASSIF_FILL[hint.label] || C.mutedFill;
    data.cell.styles.textColor = CLASSIF_TEXT[hint.label] || C.textDark;
    data.cell.styles.fontStyle = 'bold';
  } else if (hint.kind === 'nivel') {
    const style = getPerfilLeitorStyle(hint.code as PerfilLeitorCode);
    data.cell.styles.fillColor = hexToRgb(style.hex);
    data.cell.styles.textColor = hexToRgb(style.fgHex);
    data.cell.styles.fontStyle = 'bold';
  } else if (hint.kind === 'alfab') {
    if (hint.value === 'sim') {
      data.cell.styles.fillColor = C.green;
      data.cell.styles.textColor = C.white;
      data.cell.styles.fontStyle = 'bold';
    } else if (hint.value === 'nao') {
      data.cell.styles.fillColor = C.mutedFill;
      data.cell.styles.textColor = C.textGray;
      data.cell.styles.fontStyle = 'bold';
    } else {
      data.cell.styles.textColor = C.textGray;
    }
  } else if (hint.kind === 'muted') {
    data.cell.styles.textColor = C.textGray;
  }
}

function addFooters(doc: jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, pageH - 8, pageW - MARGIN, pageH - 8);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text('AfirmePlay: Sistema de Ensino e Avaliação', MARGIN, pageH - 4.5);
    doc.text(`Página ${i} de ${n}`, pageW / 2, pageH - 4.5, { align: 'center' });
    doc.text(`Gerado em ${dataGeracao}`, pageW - MARGIN, pageH - 4.5, { align: 'right' });
  }
}

function drawLegend(doc: jsPDF, startY: number): void {
  let y = startY + 4;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  if (y > pageH - 28) {
    doc.addPage();
    y = MARGIN + 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.textDark);
  doc.text('Legenda — níveis de leitura', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const box = 3.2;
  let x = MARGIN;
  for (const level of ICA_LEVELS) {
    const code = ICA_TO_PERFIL_LEITOR[level.level];
    const label = PERFIL_ALFABETOMETRO_LABEL[code];
    doc.setFillColor(...hexToRgb(level.hex));
    doc.rect(x, y - box + 0.8, box, box, 'F');
    doc.setTextColor(...C.textDark);
    const text = `${code} — ${label}`;
    doc.text(text, x + box + 1.5, y);
    x += box + 1.5 + doc.getTextWidth(text) + 6;
    if (x > pageW - MARGIN - 55) {
      x = MARGIN;
      y += 6;
      if (y > pageH - 18) {
        doc.addPage();
        y = MARGIN + 6;
      }
    }
  }
  y += 7;
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...C.textGray);
  doc.text('Alfabetizado = Leitor Fluente (LF)', MARGIN, y);
}

async function drawHeader(
  doc: jsPDF,
  options: RelatorioUnificadoPdfOptions,
  dataGeracao: string,
  blockLabel?: string
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const { logo } = await loadCityBrandingForReportPdf(options.cityId);
  let y = MARGIN;

  if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
    const { w, h } = scaledLogo(logo.iw, logo.ih, 36, 14);
    doc.addImage(logo.dataUrl, 'PNG', pageW / 2 - w / 2, y, w, h);
    y += h + 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.textDark);
  doc.text('Relatório Unificado', pageW / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(11);
  doc.setTextColor(...C.primary);
  const rotuloLines = doc.splitTextToSize(
    options.report.metadados.rotuloCombinado || '',
    pageW - MARGIN * 2
  ) as string[];
  doc.text(rotuloLines, pageW / 2, y, { align: 'center' });
  y += rotuloLines.length * 5 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.textGray);
  doc.text(options.escopoSubtitulo || '', pageW / 2, y, { align: 'center' });
  y += 5;

  const tipo = options.flow === 'cartao' ? 'Cartão-resposta' : 'Avaliação online';
  doc.text(`${tipo} · Gerado em ${dataGeracao}`, pageW / 2, y, { align: 'center' });
  y += 5;

  const leitura = options.report.metadados.leitura;
  const modoLeitura =
    leitura?.modo === 'edicao' ? 'Por edição' : 'Por avaliação';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textGray);
  doc.text(`Leitura: ${modoLeitura}`, pageW / 2, y, { align: 'center' });
  y += 4;

  if (leitura?.escopoMensagem) {
    const escopoLines = doc.splitTextToSize(
      leitura.escopoMensagem,
      pageW - MARGIN * 2
    ) as string[];
    doc.text(escopoLines, pageW / 2, y, { align: 'center' });
    y += escopoLines.length * 4 + 1;
  }

  if (
    leitura?.modo === 'edicao' &&
    Array.isArray(leitura.avaliacoesIncluidas) &&
    leitura.avaliacoesIncluidas.length > 0
  ) {
    const lista = leitura.avaliacoesIncluidas
      .map((a) => a.titulo || a.id)
      .join(' · ');
    const inclLines = doc.splitTextToSize(
      `Avaliações incluídas: ${lista}`,
      pageW - MARGIN * 2
    ) as string[];
    doc.text(inclLines, pageW / 2, y, { align: 'center' });
    y += inclLines.length * 4 + 2;
  } else {
    y += 2;
  }

  if (blockLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.textDark);
    doc.text(blockLabel, MARGIN, y);
    y += 4;
  }

  const r = options.report.resumo;
  const cardW = (pageW - MARGIN * 2 - 4) / 2;
  const cardH = 16;
  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.bgHeader);
  doc.roundedRect(MARGIN, y, cardW, cardH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.textDark);
  doc.text(
    `${formatMetric(r.icaPctLf)}% alfabetizados · ${r.alunosLf} de ${r.alunosComLeitura} avaliados`,
    MARGIN + 3,
    y + 10
  );
  doc.roundedRect(MARGIN + cardW + 4, y, cardW, cardH, 1.5, 1.5, 'FD');
  doc.text(
    `${r.alunosSemLeitura} aluno${r.alunosSemLeitura === 1 ? '' : 's'} sem leitura`,
    MARGIN + cardW + 7,
    y + 7
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text('Inclui ausentes e leituras não concluídas', MARGIN + cardW + 7, y + 12);

  return y + cardH + 5;
}

export async function generateRelatorioUnificadoPdf(
  options: RelatorioUnificadoPdfOptions
): Promise<void> {
  const { report } = options;
  if (!report?.alunos) throw new Error('Não há relatório para exportar.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: 'Relatório Unificado — AfirmePlay',
    subject: report.metadados.rotuloCombinado || 'Relatório Unificado',
    author: 'AfirmePlay',
    creator: 'AfirmePlay',
    keywords: 'relatorio-unificado, afirmeplay, leitura',
  });
  const dataGeracao = fmtNow();
  const { default: autoTable } = await import('jspdf-autotable');

  const disciplinas = report.disciplinas || [];
  const maxPerBlock = maxDisciplinasPerBlock(doc);
  const chunks: Disc[][] = [];
  if (disciplinas.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < disciplinas.length; i += maxPerBlock) {
      chunks.push(disciplinas.slice(i, i + maxPerBlock));
    }
  }

  const chosenFont =
    disciplinas.length <= maxPerBlock
      ? RELATORIO_UNIFICADO_PDF_BODY_FONT_MAX
      : RELATORIO_UNIFICADO_PDF_BODY_FONT_MIN;

  for (let bi = 0; bi < chunks.length; bi++) {
    if (bi > 0) doc.addPage();
    const slice = chunks[bi];
    const blockLabel =
      chunks.length > 1
        ? `Disciplinas ${bi * maxPerBlock + 1}–${bi * maxPerBlock + slice.length} de ${disciplinas.length}`
        : undefined;

    const startY = await drawHeader(doc, options, dataGeracao, blockLabel);
    const { body, hints } = buildBody(report.alunos, slice);

    autoTable(doc, {
      startY,
      head: headRows(slice),
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: chosenFont,
        cellPadding: 1.2,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: C.textDark,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.bgHeader,
        textColor: C.textDark,
        fontStyle: 'bold',
        fontSize: Math.max(RELATORIO_UNIFICADO_PDF_BODY_FONT_MIN, chosenFont - 0.5),
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: columnStyles(slice),
      margin: { left: MARGIN, right: MARGIN, bottom: 12 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      didParseCell: (data) => applyCellStyles(data, hints),
    });

    // Fix headStyles typo if any slipped
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      startY + 20;
    if (bi === chunks.length - 1) {
      drawLegend(doc, finalY);
    }
  }

  addFooters(doc, dataGeracao);

  const escolaPart = slugify(options.escolaNome || 'escola');
  const turmaPart = options.turmaNome ? `_${slugify(options.turmaNome)}` : '';
  doc.save(`relatorio-unificado_${escolaPart}${turmaPart}_${fmtDateFile()}.pdf`);
}

