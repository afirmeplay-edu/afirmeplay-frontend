/**
 * PDF da Calculadora de Metas IDEB — capa institucional, histórico, escolas e memorial.
 */
import { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import {
  analyzeHistoricalGrowth,
  buildHistoricalDisplaySeries,
  calculateGrowthNeeded,
  filterValidIdebHistory,
  getLatestValidIdebFromHistory,
} from '@/utils/idebCalculator';
import type { EducationLevel, Escola, HistoricoCompleto, IdebData } from '@/types/idebMeta';

export type IdebMetaChartSnapshot = {
  dataUrl: string;
  width: number;
  height: number;
};

export type IdebMetaChartSnapshots = {
  serieHistorica?: IdebMetaChartSnapshot | null;
  crescimentoBienal?: IdebMetaChartSnapshot | null;
  memorialCalculo?: IdebMetaChartSnapshot | null;
};

export type GenerateIdebMetaPdfOptions = {
  cityId?: string | null;
  municipalityData: IdebData;
  activeEntity: IdebData | Escola;
  activeEntityName: string;
  entityType: 'municipal' | 'school';
  customTarget: number;
  targetYear: number;
  level: EducationLevel;
  stateName?: string;
  municipalityName?: string;
  schools?: Escola[];
  fileNameBase?: string;
  /** Capturas html2canvas dos blocos exibidos na interface web */
  chartSnapshots?: IdebMetaChartSnapshots;
};

/** Captura um bloco da interface (card + gráfico) para embutir no PDF */
export async function captureIdebMetaChartElement(
  element: HTMLElement | null
): Promise<IdebMetaChartSnapshot | null> {
  if (!element) return null;

  const html2canvas = (await import('html2canvas')).default;
  type StyleBackup = {
    el: HTMLElement;
    overflow: string;
    overflowY: string;
    width: string;
    maxWidth: string;
    paddingTop: string;
    paddingBottom: string;
  };
  const backups: StyleBackup[] = [];

  const pushBackup = (el: HTMLElement, expandWidth = false) => {
    backups.push({
      el,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
      width: el.style.width,
      maxWidth: el.style.maxWidth,
      paddingTop: el.style.paddingTop,
      paddingBottom: el.style.paddingBottom,
    });
    el.style.overflow = 'visible';
    el.style.overflowY = 'visible';
    if (expandWidth) {
      el.style.width = `${Math.max(el.scrollWidth, el.clientWidth)}px`;
      el.style.maxWidth = 'none';
    }
  };

  pushBackup(element, true);
  element.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const { overflowX, overflowY, overflow } = window.getComputedStyle(el);
    const needsExpand =
      overflowX === 'auto' ||
      overflowX === 'scroll' ||
      overflow === 'auto' ||
      overflow === 'scroll';
    const needsVisible =
      overflow === 'hidden' ||
      overflowY === 'hidden' ||
      overflowX === 'hidden';
    if (needsExpand || needsVisible) {
      pushBackup(el, needsExpand);
    }
  });

  const prevPaddingTop = element.style.paddingTop;
  const prevPaddingBottom = element.style.paddingBottom;
  element.style.paddingTop = '8px';
  element.style.paddingBottom = '8px';

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const captureW = Math.max(element.scrollWidth, element.clientWidth) + 16;
    const captureH = Math.max(element.scrollHeight, element.clientHeight) + 16;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: captureW,
      height: captureH,
      windowWidth: captureW,
      windowHeight: captureH,
      x: -8,
      y: -8,
      onclone: (_clonedDoc, clonedElement) => {
        const nodes = [
          clonedElement as HTMLElement,
          ...Array.from((clonedElement as HTMLElement).querySelectorAll<HTMLElement>('*')),
        ];

        nodes.forEach((el) => {
          el.style.overflow = 'visible';
          el.style.overflowY = 'visible';
          el.style.textOverflow = 'clip';
          if (el.classList.contains('truncate')) {
            el.style.whiteSpace = 'normal';
            el.style.overflow = 'visible';
          }
          const tag = el.tagName.toLowerCase();
          if (tag === 'p' || tag === 'span') {
            el.style.lineHeight = '1.35';
          }
        });
      },
    });

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    element.style.paddingTop = prevPaddingTop;
    element.style.paddingBottom = prevPaddingBottom;
    for (const { el, overflow, overflowY, width, maxWidth, paddingTop, paddingBottom } of backups) {
      el.style.overflow = overflow;
      el.style.overflowY = overflowY;
      el.style.width = width;
      el.style.maxWidth = maxWidth;
      el.style.paddingTop = paddingTop;
      el.style.paddingBottom = paddingBottom;
    }
  }
}

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function fmtNow(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scaledSize(iw: number, ih: number, desiredW: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
}

function sanitizeFileNameBase(value: string, fallback: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || fallback
  );
}

function addFootersAllPages(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.text('Afirme Play Soluções Educativas', margin, pageH - 9);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 9, { align: 'center' });
    doc.text(fmtNow(), pageW - margin, pageH - 9, { align: 'right' });
  }
}

function drawSectionTitle(doc: jsPDF, margin: number, y: number, title: string): number {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text(title, margin, y);
  return y + 8;
}

function drawFiltersCard(doc: jsPDF, margin: number, pageW: number, titleY: number, filterLines: string[]): number {
  const cardPad = 5;
  const innerW = pageW - 2 * margin;
  const lineGap = 4.2;
  const titleLineH = 6;
  const bodyH = filterLines.reduce((acc, line) => {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    return acc + wrapped.length * lineGap;
  }, 0);
  const cardH = titleLineH + bodyH + cardPad * 2 + 4;
  const yTop = titleY;

  doc.setFillColor(...C.white);
  doc.rect(margin, yTop, innerW, cardH, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(margin, yTop, 3.5, cardH, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.35);
  doc.rect(margin, yTop, innerW, cardH, 'S');

  let cy = yTop + cardPad + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('Contexto do relatório', margin + 10, cy);
  cy += titleLineH + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textDark);
  for (const line of filterLines) {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    doc.text(wrapped, margin + 10, cy);
    cy += wrapped.length * lineGap;
  }

  return yTop + cardH + 10;
}

async function addCover(
  doc: jsPDF,
  titleBand: string,
  subtitleBand: string,
  escopoLinha: string,
  cityId: string | null
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 58;

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, 'F');

  const { logo: logoAsset } = await loadCityBrandingForReportPdf(cityId);
  let logoBottom = 0;
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 38);
    doc.addImage(logoAsset.dataUrl, 'PNG', centerX - w / 2, 8, w, h);
    logoBottom = 8 + h;
  } else {
    doc.setFontSize(16);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('AFIRME PLAY', centerX, 22, { align: 'center' });
    logoBottom = 28;
  }

  const titleY = Math.max(logoBottom + 5, BAND_H - 14);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(titleBand, centerX, titleY, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const subLines = doc.splitTextToSize(subtitleBand, pageW - 40) as string[];
  doc.text(subLines, centerX, titleY + 7, { align: 'center' });

  let y = BAND_H + 18;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  const escopoLines = doc.splitTextToSize(escopoLinha, pageW - 36) as string[];
  doc.text(escopoLines, centerX, y, { align: 'center' });
  y += escopoLines.length * 6 + 14;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.textGray);
  doc.text('Projeção de metas com base no histórico de crescimento IDEB.', centerX, y, { align: 'center' });
}

function getHistoricoRows(historico: HistoricoCompleto[]): string[][] {
  const display = buildHistoricalDisplaySeries(historico);
  if (display.years.length === 0) return [];

  const sorted = [...historico].sort((a, b) => a.ano - b.ano);
  return sorted.map((row, idx) => {
    const diff = idx > 0 ? display.diffs[idx - 1] : null;
    const diffLabel =
      diff === null ? '—' : diff > 0 ? `+${formatDecimal1PtBr(diff)}` : formatDecimal1PtBr(diff);
    const idebLabel =
      Number(row.ideb) > 0 ? formatDecimal1PtBr(row.ideb) : '0,0 (sem nota)';
    return [
      String(row.ano),
      idebLabel,
      formatDecimal1PtBr(row.port),
      formatDecimal1PtBr(row.math),
      formatDecimal1PtBr(row.fluxo),
      diffLabel,
    ];
  });
}

function defaultTableStyles(margin: number, pageW: number): UserOptions {
  return {
    theme: 'striped',
    showHead: 'everyPage',
    tableWidth: pageW - 2 * margin,
    margin: { left: margin, right: margin, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
      lineColor: C.borderLight,
      lineWidth: 0.12,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: C.primary,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.8,
    },
    alternateRowStyles: { fillColor: [253, 252, 254] },
  };
}

function markMissingScoreRows(hookData: CellHookData): void {
  if (hookData.section !== 'body' || hookData.column.index !== 1) return;
  const raw = String(hookData.cell.raw ?? '');
  if (raw.includes('sem nota')) {
    hookData.cell.styles.textColor = C.textGray;
    hookData.cell.styles.fontStyle = 'italic';
  }
}

function ensurePageSpace(doc: jsPDF, y: number, needed: number, margin = 16): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 20) {
    doc.addPage();
    return margin;
  }
  return y;
}

function addChartSnapshot(
  doc: jsPDF,
  margin: number,
  y: number,
  snapshot: IdebMetaChartSnapshot
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * margin;

  y = ensurePageSpace(doc, y, 90);

  let drawW = contentW;
  let drawH = (snapshot.height * drawW) / snapshot.width;
  const maxH = pageH - 24 - y;

  if (drawH > maxH) {
    drawH = maxH;
    drawW = (snapshot.width * drawH) / snapshot.height;
  }

  const x = margin + (contentW - drawW) / 2;
  doc.addImage(snapshot.dataUrl, 'PNG', x, y, drawW, drawH);
  return y + drawH + 12;
}

export async function generateIdebMetaPdf(opts: GenerateIdebMetaPdfOptions): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW = doc.internal.pageSize.getWidth();

  const historico = opts.activeEntity.historico ?? [];
  const displaySeries = buildHistoricalDisplaySeries(historico);
  const growthInfo = analyzeHistoricalGrowth(historico);
  const latestValid = getLatestValidIdebFromHistory(historico);
  const canCalculate = Boolean(latestValid && growthInfo.years.length > 0);
  const validHist = filterValidIdebHistory(historico);
  const calculationData = canCalculate
    ? calculateGrowthNeeded(
        Number(validHist[validHist.length - 1].ideb),
        opts.customTarget,
        validHist.length > 1
          ? Number(validHist[validHist.length - 1].ideb) - Number(validHist[validHist.length - 2].ideb)
          : 0
      )
    : null;

  const entityLabel = opts.entityType === 'municipal' ? 'Rede municipal' : 'Unidade escolar';
  const stateName = opts.stateName?.trim() || opts.municipalityData.uf || '—';
  const municipalityName = opts.municipalityName?.trim() || opts.municipalityData.municipio || '—';

  await addCover(
    doc,
    'CÁLCULO DE METAS IDEB',
    `${opts.level} • Meta ${opts.targetYear}`,
    opts.activeEntityName.toUpperCase(),
    opts.cityId ?? null
  );

  doc.addPage();
  let y = 16;

  const filterLines = [
    `Estado: ${stateName}`,
    `Município: ${municipalityName}`,
    `Nível de ensino: ${opts.level}`,
    `${entityLabel}: ${opts.activeEntityName}`,
    `Ano da meta: ${opts.targetYear}`,
    `Meta projetada: ${canCalculate ? formatDecimal1PtBr(opts.customTarget) : '—'}`,
  ];
  y = drawFiltersCard(doc, margin, pageW, y, filterLines);

  y = drawSectionTitle(doc, margin, y, 'Resumo');
  const resumoBody: string[][] = [
    ['IDEB exibido (último ano)', formatDecimal1PtBr(opts.activeEntity.ideb)],
    [
      'IDEB base para cálculo',
      latestValid ? `${formatDecimal1PtBr(latestValid.ideb)} (${latestValid.ano})` : '—',
    ],
    [`Meta ${opts.targetYear}`, canCalculate ? formatDecimal1PtBr(opts.customTarget) : '—'],
    ['Pico de crescimento bienal', canCalculate ? `+${formatDecimal1PtBr(growthInfo.maxDiff)}` : '—'],
    ['Diferença até a meta', calculationData ? `+${formatDecimal1PtBr(calculationData.difference)}` : '—'],
    ['Esforço estimado', calculationData ? formatPercent1PtBr(calculationData.percent) : '—'],
    ['Diagnóstico', canCalculate ? 'Viável' : 'Sem dados para cálculo'],
  ];

  autoTable(doc, {
    ...defaultTableStyles(margin, pageW),
    head: [['Indicador', 'Valor']],
    body: resumoBody,
    startY: y,
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold', textColor: C.textDark },
      1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: C.primary },
    },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 12;

  if (displaySeries.hasMissingScores) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...C.textGray);
    doc.text(
      'Períodos com IDEB 0,0 indicam ausência de nota e não entram no cálculo da meta.',
      margin,
      y
    );
    y += 8;
  }

  y = drawSectionTitle(doc, margin, y, 'Histórico de evolução');
  const historicoRows = getHistoricoRows(historico);

  autoTable(doc, {
    ...defaultTableStyles(margin, pageW),
    head: [['Ano', 'IDEB', 'Português', 'Matemática', 'Fluxo', '∆ Bienal']],
    body: historicoRows.length > 0 ? historicoRows : [['—', 'Sem histórico registrado', '', '', '', '']],
    startY: y,
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: markMissingScoreRows,
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 12;

  const charts = opts.chartSnapshots;
  if (charts?.serieHistorica) {
    y = addChartSnapshot(doc, margin, y, charts.serieHistorica);
  }

  if (charts?.crescimentoBienal) {
    y = addChartSnapshot(doc, margin, y, charts.crescimentoBienal);
  } else if (canCalculate && growthInfo.diffs.length > 0) {
    y = drawSectionTitle(doc, margin, y, 'Crescimento bienal (anos com nota válida)');
    const crescimentoBody = growthInfo.diffs.map((diff, i) => [
      `${growthInfo.years[i]}–${growthInfo.years[i + 1]}`,
      diff > 0 ? `+${formatDecimal1PtBr(diff)}` : formatDecimal1PtBr(diff),
    ]);

    autoTable(doc, {
      ...defaultTableStyles(margin, pageW),
      head: [['Período', 'Variação']],
      body: crescimentoBody,
      startY: y,
      columnStyles: {
        0: { cellWidth: 48, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'center', fontStyle: 'bold', textColor: C.primary },
      },
    });

    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 12;
  }

  const schools = opts.schools ?? [];
  if (schools.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 16;
    }

    y = drawSectionTitle(doc, margin, y, 'Unidades escolares do município');
    const schoolsBody = schools.map((school) => {
      const schoolLatest = school.historico?.length
        ? [...school.historico].sort((a, b) => b.ano - a.ano)[0]
        : null;
      const idebLabel =
        school.ideb > 0
          ? formatDecimal1PtBr(school.ideb)
          : '0,0 (sem nota)';
      const anoLabel = schoolLatest ? String(schoolLatest.ano) : '—';
      return [school.nome, idebLabel, anoLabel];
    });

    autoTable(doc, {
      ...defaultTableStyles(margin, pageW),
      head: [['Unidade escolar', 'IDEB', 'Último ano']],
      body: schoolsBody,
      startY: y,
      columnStyles: {
        0: { cellWidth: 'auto', minCellWidth: 60 },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 24, halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 1) {
          const raw = String(hookData.cell.raw ?? '');
          if (raw.includes('sem nota')) {
            hookData.cell.styles.textColor = C.textGray;
            hookData.cell.styles.fontStyle = 'italic';
          }
        }
      },
    });

    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 12;
  }

  if (canCalculate && latestValid) {
    if (charts?.memorialCalculo) {
      y = ensurePageSpace(doc, y, 90);
      y = addChartSnapshot(doc, margin, y, charts.memorialCalculo);
    } else {
      if (y > doc.internal.pageSize.getHeight() - 45) {
        doc.addPage();
        y = 16;
      }

      y = drawSectionTitle(doc, margin, y, 'Memorial de cálculo');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.textDark);

      const memorialLines = [
        `A projeção de meta em ${formatDecimal1PtBr(opts.customTarget)} baseia-se no IDEB de ${formatDecimal1PtBr(latestValid.ideb)} (${latestValid.ano}), acrescido do maior crescimento bienal histórico (+${formatDecimal1PtBr(growthInfo.maxDiff)}).`,
        displaySeries.hasMissingScores
          ? 'Períodos com nota 0,0 foram ignorados no cálculo.'
          : '',
        calculationData
          ? `Para atingir a meta, é necessário um incremento de +${formatDecimal1PtBr(calculationData.difference)} (${formatPercent1PtBr(calculationData.percent)} de esforço relativo ao IDEB base).`
          : '',
      ].filter(Boolean);

      for (const line of memorialLines) {
        const wrapped = doc.splitTextToSize(line, pageW - 2 * margin) as string[];
        doc.text(wrapped, margin, y);
        y += wrapped.length * 5 + 3;
      }
    }
  }

  addFootersAllPages(doc);

  const rawBase =
    opts.fileNameBase ??
    `metas-ideb-${sanitizeFileNameBase(municipalityName, 'municipio')}-${sanitizeFileNameBase(opts.activeEntityName, 'entidade')}`;
  const safeNameBase = sanitizeFileNameBase(rawBase, 'metas-ideb');
  doc.save(`${safeNameBase}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
