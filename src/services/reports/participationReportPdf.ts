/**
 * PDF do Relatório de Participação — capa e identidade alinhadas
 * aos relatórios institucionais (Análise das Avaliações / Ranking).
 */
import { jsPDF } from 'jspdf';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import type { ParticipationResumo } from '@/types/participation-report';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  matriculados: [51, 101, 138] as [number, number, number],
  avaliados: [117, 142, 79] as [number, number, number],
  naoParticiparam: [148, 163, 184] as [number, number, number],
};

const MARGIN = 15;
const TOP_BAND_H = 18;

export type ParticipationPdfFilterLabels = {
  estado: string;
  municipio: string;
  avaliacoes?: string;
  escolas?: string;
  series?: string;
  turmas?: string;
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

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatPercent(value: number): string {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatCoverValue(value: string): string {
  return String(value ?? '').trim().toLocaleUpperCase('pt-BR') || '—';
}

function scaledSize(iw: number, ih: number, desiredW: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
}

function tableFinalY(doc: jsPDF, fallback: number): number {
  const ly = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return typeof ly === 'number' ? ly : fallback;
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

function drawTopBand(doc: jsPDF, pageW: number, title: string): void {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, TOP_BAND_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  const t = String(title || '').trim();
  if (t) doc.text(t.toUpperCase(), pageW / 2, 11.5, { align: 'center' });
}

async function drawCoverPage(
  doc: jsPDF,
  labels: ParticipationPdfFilterLabels,
  metricas: ParticipationResumo['metricas'],
  cityId: string | null
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 62;
  const dataGeracao = fmtNow();

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, 'F');

  let logoBottomInBand = 0;
  const { logo: logoAsset } = await loadCityBrandingForReportPdf(cityId);
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 40);
    doc.addImage(logoAsset.dataUrl, 'PNG', centerX - w / 2, 8, w, h);
    logoBottomInBand = 8 + h;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('AFIRME PLAY', centerX, 24, { align: 'center' });
    logoBottomInBand = 30;
  }

  const titleY = Math.max(logoBottomInBand + 6, BAND_H - 16);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('RELATÓRIO DE PARTICIPAÇÃO', centerX, titleY, { align: 'center' });
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.text('MATRÍCULAS, AVALIADOS E TAXA DE PARTICIPAÇÃO', centerX, titleY + 7, {
    align: 'center',
  });

  let y = BAND_H + 14;
  const loc = [labels.estado, labels.municipio]
    .map((v) => formatCoverValue(v))
    .filter((v) => v && v !== '—');
  if (loc.length) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(loc.join(' — '), centerX, y, { align: 'center' });
    y += 8;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.textGray);
  doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
  y += 16;

  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text('Participação', centerX, y, { align: 'center' });
  y += 12;

  doc.setFontSize(12);
  doc.setTextColor(...C.textDark);
  doc.text(`${formatPercent(metricas.percentual_participacao)} de participação no escopo`, centerX, y, {
    align: 'center',
  });
  y += 18;

  const cardLines: Array<{ label: string; value: string }> = [
    { label: 'ESTADO', value: labels.estado || '—' },
    { label: 'MUNICÍPIO', value: labels.municipio || '—' },
    { label: 'AVALIAÇÕES', value: labels.avaliacoes || 'Todas' },
    { label: 'ESCOLAS', value: labels.escolas || 'Todas' },
    { label: 'SÉRIES', value: labels.series || 'Todas' },
    { label: 'TURMAS', value: labels.turmas || 'Todas' },
    { label: 'MATRICULADOS', value: formatNumber(metricas.matriculados) },
    { label: 'AVALIADOS', value: formatNumber(metricas.avaliados) },
    { label: 'TURMAS (TOTAL)', value: formatNumber(metricas.total_turmas) },
    { label: 'PARTICIPAÇÃO', value: formatPercent(metricas.percentual_participacao) },
    { label: 'GERADO EM', value: dataGeracao },
  ];

  const cardW = pageW - 72;
  const cardX = (pageW - cardW) / 2;
  const ACCENT_W = 5;
  const rowH = 6.2;
  let estimateH = 28;
  for (const { value } of cardLines) {
    const wrapped = doc.splitTextToSize(formatCoverValue(value), cardW - 78) as string[];
    estimateH += Math.max(rowH, wrapped.length * 4.6);
  }
  const cardH = Math.min(Math.max(estimateH, 90), pageH - y - 20);

  doc.setFillColor(...C.bgLight);
  doc.rect(cardX, y, cardW, cardH, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(cardX, y, ACCENT_W, cardH, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.45);
  doc.rect(cardX, y, cardW, cardH, 'S');

  let cy = y + 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text('INFORMAÇÕES DO RELATÓRIO', cardX + ACCENT_W + (cardW - ACCENT_W) / 2, cy, {
    align: 'center',
  });
  cy += 6;
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.25);
  doc.line(cardX + ACCENT_W + 6, cy, cardX + cardW - 6, cy);
  cy += 9;

  const labelX = cardX + ACCENT_W + 10;
  const valueX = cardX + 58;
  const maxValueW = cardW - 66;
  doc.setFontSize(8.2);
  for (const { label, value } of cardLines) {
    if (cy > y + cardH - 6) break;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(`${label}:`, labelX, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const vLines = doc.splitTextToSize(formatCoverValue(value), maxValueW) as string[];
    doc.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 4.4);
  }
}

function drawKpiCards(
  doc: jsPDF,
  y: number,
  pageW: number,
  metricas: ParticipationResumo['metricas']
): number {
  const gap = 4;
  const cardW = (pageW - MARGIN * 2 - gap * 3) / 4;
  const cardH = 22;
  const items = [
    { label: 'Matriculados', value: formatNumber(metricas.matriculados), color: C.matriculados },
    { label: 'Avaliados', value: formatNumber(metricas.avaliados), color: C.avaliados },
    { label: 'Turmas', value: formatNumber(metricas.total_turmas), color: C.primary },
    {
      label: 'Participação',
      value: formatPercent(metricas.percentual_participacao),
      color: C.avaliados,
    },
  ];

  items.forEach((item, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setFillColor(...C.bgLight);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F');
    doc.setFillColor(...item.color);
    doc.rect(x, y, 2.2, cardH, 'F');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.text(item.label, x + 5, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.textDark);
    doc.text(item.value, x + 5, y + 16);
  });

  return y + cardH + 10;
}

function renderBarChartImage(matriculados: number, avaliados: number): string {
  const width = 720;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padL = 56;
  const padR = 28;
  const padT = 36;
  const padB = 48;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(matriculados, avaliados, 1);
  const bars = [
    { label: 'Matriculados', value: matriculados, color: '#33658A' },
    { label: 'Avaliados', value: avaliados, color: '#758E4F' },
  ];
  const barW = 90;
  const gap = 80;
  const totalBarsW = bars.length * barW + (bars.length - 1) * gap;
  const startX = padL + (plotW - totalBarsW) / 2;

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(width - padR, gy);
    ctx.stroke();
    const tick = Math.round(maxVal * (1 - i / 4));
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(tick), padL - 8, gy + 4);
  }

  bars.forEach((bar, i) => {
    const x = startX + i * (barW + gap);
    const h = (bar.value / maxVal) * plotH;
    const y = padT + plotH - h;
    ctx.fillStyle = bar.color;
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatNumber(bar.value), x + barW / 2, y - 10);
    ctx.font = '13px Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(bar.label, x + barW / 2, padT + plotH + 28);
  });

  return canvas.toDataURL('image/png');
}

function renderDonutChartImage(
  avaliados: number,
  matriculados: number,
  percentual: number
): string {
  const width = 520;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const nao = Math.max(0, matriculados - avaliados);
  const total = Math.max(matriculados, 1);
  const cx = width / 2;
  const cy = height / 2 - 18;
  const outerR = 110;
  const innerR = 68;

  const slices = [
    { value: avaliados, color: '#758E4F', label: 'Participaram' },
    { value: nao, color: '#94a3b8', label: 'Não participaram' },
  ].filter((s) => s.value > 0);

  let start = -Math.PI / 2;
  slices.forEach((slice) => {
    const angle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.fillStyle = slice.color;
    ctx.arc(cx, cy, outerR, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 28px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatPercent(percentual), cx, cy - 6);
  ctx.font = '12px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('participação', cx, cy + 18);

  let legendX = 70;
  const legendY = height - 36;
  slices.forEach((slice) => {
    ctx.fillStyle = slice.color;
    ctx.beginPath();
    ctx.arc(legendX, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#374151';
    ctx.font = '12px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = `${slice.label} (${formatNumber(slice.value)})`;
    ctx.fillText(text, legendX + 12, legendY);
    legendX += ctx.measureText(text).width + 36;
  });

  return canvas.toDataURL('image/png');
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 18) {
    doc.addPage();
    drawTopBand(doc, doc.internal.pageSize.getWidth(), 'Relatório de Participação');
    return TOP_BAND_H + 12;
  }
  return y;
}

function drawSectionTitle(doc: jsPDF, y: number, pageW: number, title: string): number {
  y = ensureSpace(doc, y, 16);
  doc.setFillColor(...C.primary);
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 10, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  doc.text(title, MARGIN + 4, y + 6.8);
  return y + 14;
}

export async function generateParticipationReportPdf(opts: {
  report: ParticipationResumo;
  labels: ParticipationPdfFilterLabels;
  cityId: string | null;
}): Promise<void> {
  const { report, labels, cityId } = opts;
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dataGeracao = fmtNow();

  await drawCoverPage(doc, labels, report.metricas, cityId);

  doc.addPage();
  drawTopBand(doc, pageW, 'Relatório de Participação');
  let y = TOP_BAND_H + 12;

  y = drawSectionTitle(doc, y, pageW, 'Indicadores gerais');
  y = drawKpiCards(doc, y, pageW, report.metricas);

  y = drawSectionTitle(doc, y, pageW, 'Gráficos');
  y = ensureSpace(doc, y, 78);

  const barImg = renderBarChartImage(report.metricas.matriculados, report.metricas.avaliados);
  const donutImg = renderDonutChartImage(
    report.metricas.avaliados,
    report.metricas.matriculados,
    report.metricas.percentual_participacao
  );

  const chartH = 62;
  const chartGap = 4;
  const chartW = (pageW - MARGIN * 2 - chartGap) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textDark);
  doc.text('Matriculados × Avaliados', MARGIN, y);
  doc.text('Taxa de participação', MARGIN + chartW + chartGap, y);
  y += 4;

  if (barImg) {
    doc.addImage(barImg, 'PNG', MARGIN, y, chartW, chartH);
  }
  if (donutImg) {
    doc.addImage(donutImg, 'PNG', MARGIN + chartW + chartGap, y, chartW, chartH);
  }
  y += chartH + 10;

  y = drawSectionTitle(doc, y, pageW, 'Por escola');
  autoTable(doc, {
    startY: y,
    head: [['Escola', 'Matriculados', 'Avaliados', 'Turmas', 'Participação']],
    body:
      report.por_escola.length > 0
        ? report.por_escola.map((row) => [
            row.escola_nome || '—',
            formatNumber(row.matriculados),
            formatNumber(row.avaliados),
            formatNumber(row.total_turmas),
            formatPercent(row.percentual_participacao),
          ])
        : [['Nenhuma escola no escopo', '—', '—', '—', '—']],
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: C.textDark,
      lineColor: C.borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 78, halign: 'left' },
      1: { cellWidth: 26, halign: 'right' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
    },
    alternateRowStyles: { fillColor: C.bgLight },
  });
  y = tableFinalY(doc, y) + 10;

  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, y, pageW, 'Por turma');
  autoTable(doc, {
    startY: y,
    head: [['Turma', 'Matriculados', 'Avaliados', 'Participação']],
    body:
      report.por_turma.length > 0
        ? report.por_turma.map((row) => [
            row.turma_nome || '—',
            formatNumber(row.matriculados),
            formatNumber(row.avaliados),
            formatPercent(row.percentual_participacao),
          ])
        : [['Nenhuma turma no escopo', '—', '—', '—']],
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: C.textDark,
      lineColor: C.borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 100, halign: 'left' },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: { fillColor: C.bgLight },
  });

  addFooters(doc, dataGeracao);
  doc.save(`relatorio-participacao-${new Date().toISOString().slice(0, 10)}.pdf`);
}
