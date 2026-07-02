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
  type HistoricalDisplaySeries,
} from '@/utils/idebCalculator';
import type { EducationLevel, Escola, IdebData } from '@/types/idebMeta';

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

/** Cores explícitas para rótulos SVG (html2canvas não resolve hsl(var(...))) */
const IDEB_CHART_LABEL_FILL = {
  dark: '#f1f5f9',
  light: '#374151',
} as const;

const IDEB_CHART_AXIS_FILL = {
  dark: '#a1a1aa',
  light: '#6b7280',
} as const;

function isAppDarkMode(): boolean {
  return (
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark'))
  );
}

function applySvgTextFill(el: SVGTextElement, fill: string): void {
  el.setAttribute('fill', fill);
  el.style.fill = fill;
  el.style.opacity = '1';
  el.removeAttribute('opacity');
  el.querySelectorAll('tspan').forEach((tspan) => {
    const tsp = tspan as SVGTextElement;
    tsp.setAttribute('fill', fill);
    tsp.style.fill = fill;
    tsp.style.opacity = '1';
  });
}

/** Remove clip-path do SVG — html2canvas omite rótulos dentro de áreas recortadas */
function removeRechartsClipPathsForPdfCapture(root: HTMLElement): void {
  root.querySelectorAll<SVGElement>('[clip-path]').forEach((el) => {
    el.removeAttribute('clip-path');
    el.style.clipPath = 'none';
  });
}

/** Garante rótulos SVG legíveis na captura (html2canvas não resolve fill via CSS variables) */
function fixRechartsTextForPdfCapture(root: HTMLElement, darkMode: boolean): void {
  const dataLabelFill = darkMode ? IDEB_CHART_LABEL_FILL.dark : IDEB_CHART_LABEL_FILL.light;
  const axisFill = darkMode ? IDEB_CHART_AXIS_FILL.dark : IDEB_CHART_AXIS_FILL.light;

  const dataLabelNodes = new Set<SVGTextElement>();
  const dataLabelSelectors = [
    '.ideb-chart-data-label',
    '.recharts-label-list text',
    'svg .recharts-label-list .recharts-text',
    'svg g.recharts-label-list text',
    '.ideb-chart-data-label text',
  ];

  for (const selector of dataLabelSelectors) {
    root.querySelectorAll(selector).forEach((node) => {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'text') {
        dataLabelNodes.add(node as SVGTextElement);
      } else {
        node.querySelectorAll('text').forEach((textNode) => {
          dataLabelNodes.add(textNode as SVGTextElement);
        });
      }
    });
  }

  dataLabelNodes.forEach((el) => applySvgTextFill(el, dataLabelFill));

  root.querySelectorAll('svg .recharts-cartesian-axis-tick text').forEach((node) => {
    const el = node as SVGTextElement;
    const currentFill = el.getAttribute('fill') ?? '';
    if (currentFill.includes('var(') || !currentFill) {
      applySvgTextFill(el, axisFill);
    }
  });
}

function prepareRechartsChartsForPdfCapture(root: HTMLElement, darkMode: boolean): void {
  removeRechartsClipPathsForPdfCapture(root);
  fixRechartsTextForPdfCapture(root, darkMode);
}

function resolveCaptureBackgroundColor(element: HTMLElement): string | null {
  let node: HTMLElement | null = element;
  while (node) {
    const bg = window.getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg;
    }
    node = node.parentElement;
  }
  return isAppDarkMode() ? 'hsl(220, 12%, 11%)' : '#ffffff';
}

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
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const captureW = Math.max(element.scrollWidth, element.clientWidth) + 16;
    const captureH = Math.max(element.scrollHeight, element.clientHeight) + 16;
    const captureDarkMode = isAppDarkMode();
    const captureBackground = resolveCaptureBackgroundColor(element);

    fixRechartsTextForPdfCapture(element, captureDarkMode);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: captureBackground,
      logging: false,
      width: captureW,
      height: captureH,
      windowWidth: captureW,
      windowHeight: captureH,
      x: -8,
      y: -8,
      onclone: (_clonedDoc, clonedElement) => {
        const root = clonedElement as HTMLElement;
        const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

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

        prepareRechartsChartsForPdfCapture(root, captureDarkMode);
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

/** Cores do histórico pivot — equivalentes às classes Tailwind da interface web */
const HIST_COLORS = {
  headerMuted: [229, 231, 235] as [number, number, number],
  headerMutedText: [107, 114, 128] as [number, number, number],
  mutedCell: [245, 245, 245] as [number, number, number],
  missingCell: [243, 244, 246] as [number, number, number],
  diffPositiveBg: [220, 252, 231] as [number, number, number],
  diffPositiveText: [22, 101, 52] as [number, number, number],
  diffNegativeBg: [254, 226, 226] as [number, number, number],
  diffNegativeText: [185, 28, 28] as [number, number, number],
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

function buildPivotHistoricoTable(
  displaySeries: HistoricalDisplaySeries,
  activeEntityIdeb: number,
  activeEntityAno: number,
  customTarget: number,
  targetYear: number,
  canCalculateMeta: boolean
): { head: string[][]; body: string[][]; historicalCount: number } {
  const historicalYears = displaySeries.years.slice(0, -1);
  const historicalValues = displaySeries.values.slice(0, -1);
  const historicalCount = historicalYears.length;

  const head = [
    [
      'Ano',
      ...historicalYears.map(String),
      String(activeEntityAno),
      `Meta ${targetYear}`,
    ],
  ];

  const idebRow = [
    'IDEB',
    ...historicalValues.map((v) => v.toFixed(1)),
    activeEntityIdeb.toFixed(1),
    canCalculateMeta ? customTarget.toFixed(1) : '—',
  ];

  const diffRow = [
    '∆ Bienal',
    ...displaySeries.diffs.map((d) =>
      d === null ? '—' : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)
    ),
    '',
    '',
  ];

  return { head, body: [idebRow, diffRow], historicalCount };
}

function applyPivotHistoricoCellStyles(
  hookData: CellHookData,
  displaySeries: HistoricalDisplaySeries,
  historicalCount: number
): void {
  const { section, row, column, cell } = hookData;
  const colIdx = column.index;

  if (section === 'head') {
    cell.styles.fontStyle = 'bold';
    if (colIdx === 0) {
      cell.styles.fillColor = C.primary;
      cell.styles.textColor = 255;
    } else if (colIdx === historicalCount + 1) {
      cell.styles.fillColor = HIST_COLORS.headerMuted;
      cell.styles.textColor = HIST_COLORS.headerMutedText;
    } else if (colIdx === historicalCount + 2) {
      cell.styles.fillColor = C.primary;
      cell.styles.textColor = 255;
    } else {
      cell.styles.fillColor = C.primary;
      cell.styles.textColor = 255;
    }
    return;
  }

  if (section !== 'body') return;

  if (colIdx === 0) {
    cell.styles.fontStyle = 'bold';
    cell.styles.textColor = C.textDark;
    return;
  }

  if (row.index === 0) {
    if (colIdx >= 1 && colIdx <= historicalCount) {
      const value = displaySeries.values[colIdx - 1];
      cell.styles.fontStyle = 'bold';
      if (value <= 0) {
        cell.styles.fillColor = HIST_COLORS.missingCell;
        cell.styles.textColor = C.textGray;
        cell.styles.fontStyle = 'italic';
      }
    } else if (colIdx === historicalCount + 1) {
      cell.styles.fillColor = HIST_COLORS.mutedCell;
      cell.styles.textColor = C.textDark;
      cell.styles.fontStyle = 'bold';
    } else if (colIdx === historicalCount + 2) {
      cell.styles.fillColor = C.primary;
      cell.styles.textColor = 255;
      cell.styles.fontStyle = 'bold';
    }
    return;
  }

  if (row.index === 1 && colIdx >= 1 && colIdx <= displaySeries.diffs.length) {
    const diff = displaySeries.diffs[colIdx - 1];
    if (diff === null) {
      cell.styles.textColor = C.textGray;
    } else if (diff > 0) {
      cell.styles.fillColor = HIST_COLORS.diffPositiveBg;
      cell.styles.textColor = HIST_COLORS.diffPositiveText;
      cell.styles.fontStyle = 'bold';
    } else if (diff < 0) {
      cell.styles.fillColor = HIST_COLORS.diffNegativeBg;
      cell.styles.textColor = HIST_COLORS.diffNegativeText;
      cell.styles.fontStyle = 'bold';
    }
  }
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
    alternateRowStyles: { fillColor: [255, 255, 255] },
  };
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

  if (displaySeries.years.length > 0) {
    const activeEntityAno =
      'ano' in opts.activeEntity ? opts.activeEntity.ano : opts.municipalityData.ano;
    const pivot = buildPivotHistoricoTable(
      displaySeries,
      opts.activeEntity.ideb,
      activeEntityAno,
      opts.customTarget,
      opts.targetYear,
      canCalculate
    );

    autoTable(doc, {
      ...defaultTableStyles(margin, pageW),
      theme: 'plain',
      head: pivot.head,
      body: pivot.body,
      startY: y,
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 },
        lineColor: C.borderLight,
        lineWidth: 0.12,
        valign: 'middle',
        halign: 'center',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: C.primary,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'left', fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        applyPivotHistoricoCellStyles(hookData, displaySeries, pivot.historicalCount);
      },
    });
  } else {
    autoTable(doc, {
      ...defaultTableStyles(margin, pageW),
      head: [['Ano', 'IDEB']],
      body: [['—', 'Sem histórico registrado']],
      startY: y,
    });
  }

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
    doc.addPage();
    y = 16;

    const isSchoolReport = opts.entityType === 'school' && schools.length === 1;
    y = drawSectionTitle(
      doc,
      margin,
      y,
      isSchoolReport ? 'Unidade escolar' : 'Unidades escolares do município'
    );

    const schoolsBody = schools.map((school) => {
      const schoolLatest = school.historico?.length
        ? [...school.historico].sort((a, b) => b.ano - a.ano)[0]
        : null;
      const idebLabel =
        school.ideb > 0 ? formatDecimal1PtBr(school.ideb) : '0,0 (sem nota)';
      const anoLabel = schoolLatest ? String(schoolLatest.ano) : '—';
      return [school.nome, idebLabel, anoLabel];
    });

    if (isSchoolReport) {
      schoolsBody.push([
        'Rede municipal',
        opts.municipalityData.ideb > 0
          ? formatDecimal1PtBr(opts.municipalityData.ideb)
          : '0,0 (sem nota)',
        String(opts.municipalityData.ano),
      ]);
    }

    const totalRowIndex = schoolsBody.length - 1;

    autoTable(doc, {
      ...defaultTableStyles(margin, pageW),
      theme: 'plain',
      head: [['Unidade escolar', 'IDEB', 'Último ano']],
      body: schoolsBody,
      startY: y,
      rowPageBreak: 'avoid',
      showHead: 'firstPage',
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
        if (isSchoolReport && hookData.section === 'body' && hookData.row.index === totalRowIndex) {
          hookData.cell.styles.fillColor = HIST_COLORS.mutedCell;
          hookData.cell.styles.fontStyle = 'bold';
          if (hookData.column.index === 0) {
            hookData.cell.styles.textColor = C.textGray;
            hookData.cell.styles.halign = 'left';
          } else {
            hookData.cell.styles.textColor = C.textDark;
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
