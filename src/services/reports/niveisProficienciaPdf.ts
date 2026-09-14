/**
 * PDF — Relatório Níveis de Proficiência
 * Padrão institucional (jspdf + jspdf-autotable), alinhado a Participação / Relatório Geral.
 */
import { jsPDF } from 'jspdf';
import type {
  ProficiencyLevelCount,
  ProficiencyLevelsAluno,
  ProficiencyLevelsResponse,
} from '@/services/evaluation/proficiencyLevelsApi';
import {
  PROFICIENCIA_PDF_CELL_COLORS,
  type ProficienciaFaixaKey,
} from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import {
  normalizeProficiencyLevelLabel,
  type ReportProficiencyLabel,
} from '@/utils/report/reportTagStyles';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import {
  buildHomogeneousGroups,
  type HomogeneousGroup,
} from '@/pages/reports/niveis-proficiencia/lib/groupHomogeneousClasses';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const MARGIN = 15;
const TOP_BAND_H = 18;
const SAFE_BOTTOM = 18;

const LEVELS: ReportProficiencyLabel[] = [
  'Abaixo do Básico',
  'Básico',
  'Adequado',
  'Avançado',
];

const LEVEL_TO_FAIXA: Record<ReportProficiencyLabel, ProficienciaFaixaKey> = {
  'Abaixo do Básico': 'abaixo_do_basico',
  Básico: 'basico',
  Adequado: 'adequado',
  Avançado: 'avancado',
};

const LEVEL_FAIXA_RANGE: Record<ReportProficiencyLabel, string> = {
  'Abaixo do Básico': '0–29%',
  Básico: '30–59%',
  Adequado: '60–79%',
  Avançado: '80–100%',
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

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${formatNumber(value, digits)}%`;
}

function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('pt-BR');
}

function tableFinalY(doc: jsPDF, fallback: number): number {
  const ly = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return typeof ly === 'number' ? ly : fallback;
}

function levelFill(nivel: string | null | undefined): [number, number, number] {
  const label = normalizeProficiencyLevelLabel(nivel);
  return PROFICIENCIA_PDF_CELL_COLORS[LEVEL_TO_FAIXA[label]].fill;
}

function levelText(nivel: string | null | undefined): [number, number, number] {
  const label = normalizeProficiencyLevelLabel(nivel);
  return PROFICIENCIA_PDF_CELL_COLORS[LEVEL_TO_FAIXA[label]].text;
}

function softFill(nivel: string | null | undefined): [number, number, number] {
  const label = normalizeProficiencyLevelLabel(nivel);
  switch (label) {
    case 'Abaixo do Básico':
      return [254, 226, 226];
    case 'Básico':
      return [254, 249, 195];
    case 'Adequado':
      return [220, 252, 231];
    case 'Avançado':
      return [209, 250, 229];
  }
}

function scaledSize(iw: number, ih: number, desiredW: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
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

function ensureSpace(doc: jsPDF, y: number, needed: number, bandTitle: string): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - SAFE_BOTTOM) {
    doc.addPage();
    drawTopBand(doc, doc.internal.pageSize.getWidth(), bandTitle);
    return TOP_BAND_H + 12;
  }
  return y;
}

function drawSectionTitle(
  doc: jsPDF,
  y: number,
  pageW: number,
  title: string,
  bandTitle: string
): number {
  y = ensureSpace(doc, y, 16, bandTitle);
  doc.setFillColor(...C.primary);
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 10, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  doc.text(title, MARGIN + 4, y + 6.8);
  return y + 14;
}

async function drawCoverPage(
  doc: jsPDF,
  report: ProficiencyLevelsResponse,
  fonteLabel: string,
  cityId: string | null
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 62;
  const meta = report.meta || {};
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
  doc.setFontSize(16);
  doc.text('NÍVEIS DE PROFICIÊNCIA', centerX, titleY, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(fonteLabel.toUpperCase(), centerX, titleY + 7, { align: 'center' });

  let y = BAND_H + 16;
  if (meta.municipio || meta.estado) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(
      [meta.estado, meta.municipio].filter(Boolean).join(' — ') || '—',
      centerX,
      y,
      { align: 'center' }
    );
    y += 8;
  }

  if (meta.rede) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textGray);
    const redeLines = doc.splitTextToSize(String(meta.rede), pageW - 50) as string[];
    doc.text(redeLines, centerX, y, { align: 'center' });
    y += redeLines.length * 5 + 6;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  const tituloLines = doc.splitTextToSize(meta.titulo || 'Relatório de níveis', pageW - 50) as string[];
  doc.text(tituloLines, centerX, y, { align: 'center' });
  y += tituloLines.length * 6 + 14;

  const cardLines: Array<{ label: string; value: string }> = [
    { label: 'FONTE', value: fonteLabel },
    { label: 'AVALIAÇÃO', value: meta.titulo || '—' },
    { label: 'ESCOLA', value: meta.escola || 'Todas' },
    { label: 'SÉRIE', value: meta.serie || 'Todas' },
    { label: 'PERÍODO', value: meta.periodo || '—' },
    { label: 'DATA', value: formatDatePt(meta.data_aplicacao) },
    { label: 'ITENS', value: meta.total_itens != null ? String(meta.total_itens) : '—' },
    {
      label: 'ALUNOS',
      value: String(report.indicadores?.alunos_avaliados ?? report.alunos?.length ?? 0),
    },
    { label: 'GERADO EM', value: dataGeracao },
  ];

  const cardW = pageW - 72;
  const cardX = (pageW - cardW) / 2;
  const ACCENT_W = 5;
  const rowH = 6.2;
  let estimateH = 28;
  for (const { value } of cardLines) {
    const wrapped = doc.splitTextToSize(value, cardW - 78) as string[];
    estimateH += Math.max(rowH, wrapped.length * 4.6);
  }
  const cardH = Math.min(Math.max(estimateH, 80), pageH - y - 20);

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
    const vLines = doc.splitTextToSize(value || '—', maxValueW) as string[];
    doc.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 4.4);
  }
}

function drawKpiCards(
  doc: jsPDF,
  y: number,
  pageW: number,
  report: ProficiencyLevelsResponse
): number {
  const ind = report.indicadores || {};
  const gap = 3;
  const cardW = (pageW - MARGIN * 2 - gap * 4) / 5;
  const cardH = 24;
  const items = [
    {
      label: 'Alunos',
      value: String(ind.alunos_avaliados ?? 0),
      detail: `${ind.turmas ?? 0} turmas`,
      color: C.primary,
    },
    {
      label: 'Média acertos',
      value: formatPercent(ind.media_acertos_percentual),
      detail: report.meta?.total_itens != null ? `${report.meta.total_itens} itens` : '—',
      color: [51, 101, 138] as [number, number, number],
    },
    {
      label: 'Proficiência',
      value: formatNumber(ind.media_proficiencia),
      detail: 'média',
      color: [117, 142, 79] as [number, number, number],
    },
    {
      label: 'Adeq.+Avanç.',
      value: formatPercent(ind.adequado_avancado?.percentual),
      detail: `${ind.adequado_avancado?.quantidade ?? 0} alunos`,
      color: PROFICIENCIA_PDF_CELL_COLORS.adequado.fill,
    },
    {
      label: 'Atenção',
      value: String(ind.abaixo_do_basico?.quantidade ?? 0),
      detail: 'Abaixo do Básico',
      color: PROFICIENCIA_PDF_CELL_COLORS.abaixo_do_basico.fill,
    },
  ];

  items.forEach((item, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setFillColor(...C.bgLight);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'F');
    doc.setFillColor(...item.color);
    doc.rect(x, y, 2, cardH, 'F');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textGray);
    doc.text(item.label, x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.textDark);
    doc.text(item.value, x + 4, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.textGray);
    doc.text(item.detail, x + 4, y + 20);
  });

  return y + cardH + 8;
}

function drawEscala(
  doc: jsPDF,
  y: number,
  pageW: number,
  distribuicao: Record<string, ProficiencyLevelCount> | undefined,
  bandTitle: string
): number {
  y = ensureSpace(doc, y, 42, bandTitle);
  const contentW = pageW - MARGIN * 2;
  const barH = 5;
  const segW = contentW / 4;

  LEVELS.forEach((nivel, i) => {
    doc.setFillColor(...levelFill(nivel));
    doc.rect(MARGIN + i * segW, y, segW, barH, 'F');
  });
  y += barH + 6;

  const cardGap = 3;
  const cardW = (contentW - cardGap * 3) / 4;
  const cardH = 28;

  LEVELS.forEach((nivel, i) => {
    const x = MARGIN + i * (cardW + cardGap);
    const item = distribuicao?.[nivel];
    const qtd = item?.quantidade ?? 0;
    const pct = item?.percentual ?? 0;

    doc.setFillColor(...softFill(nivel));
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'F');
    doc.setDrawColor(...levelFill(nivel));
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDark);
    doc.text(nivel, x + 3, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textGray);
    doc.text(LEVEL_FAIXA_RANGE[nivel], x + 3, y + 11);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.textDark);
    doc.text(String(qtd), x + 3, y + 19);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textGray);
    doc.text(`alunos · ${formatPercent(pct)}`, x + 3, y + 24);

    const barMax = cardW - 6;
    doc.setFillColor(...C.white);
    doc.roundedRect(x + 3, y + cardH - 4, barMax, 1.5, 0.5, 0.5, 'F');
    doc.setFillColor(...levelFill(nivel));
    doc.roundedRect(
      x + 3,
      y + cardH - 4,
      Math.max(0.5, (barMax * Math.min(100, Math.max(0, pct))) / 100),
      1.5,
      0.5,
      0.5,
      'F'
    );
  });

  return y + cardH + 8;
}

function groupAlunosByNivel(
  alunos: ProficiencyLevelsAluno[] | undefined
): Record<ReportProficiencyLabel, ProficiencyLevelsAluno[]> {
  const map = Object.fromEntries(LEVELS.map((n) => [n, [] as ProficiencyLevelsAluno[]])) as Record<
    ReportProficiencyLabel,
    ProficiencyLevelsAluno[]
  >;
  for (const a of alunos || []) {
    map[normalizeProficiencyLevelLabel(a.nivel)].push(a);
  }
  for (const n of LEVELS) {
    map[n].sort(
      (a, b) => Number(b.percentual_acertos ?? 0) - Number(a.percentual_acertos ?? 0)
    );
  }
  return map;
}

type AutoTableFn = typeof import('jspdf-autotable').default;

function drawAlunosPorNivel(
  doc: jsPDF,
  autoTable: AutoTableFn,
  y: number,
  pageW: number,
  alunos: ProficiencyLevelsAluno[] | undefined,
  bandTitle: string
): number {
  const byLevel = groupAlunosByNivel(alunos);

  for (const nivel of LEVELS) {
    const list = byLevel[nivel];
    y = drawSectionTitle(doc, y, pageW, `Alunos — ${nivel} (${list.length})`, bandTitle);

    if (!list.length) {
      y = ensureSpace(doc, y, 10, bandTitle);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C.textGray);
      doc.text('Nenhum aluno neste nível.', MARGIN, y);
      y += 8;
      continue;
    }

    autoTable(doc, {
      startY: y,
      head: [['#', 'Aluno', 'Série', 'Turma', 'Acertos', '%', 'Nota', 'Proficiência']],
      body: list.map((a, i) => [
        String(i + 1),
        a.nome || '—',
        a.serie || '—',
        a.turma || '—',
        `${a.acertos ?? '—'}/${a.total_itens ?? '—'}`,
        formatPercent(a.percentual_acertos),
        formatNumber(a.nota),
        formatNumber(a.proficiencia),
      ]),
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: C.textDark,
        lineColor: C.borderLight,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: levelFill(nivel),
        textColor: levelText(nivel),
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 52, halign: 'left' },
        2: { cellWidth: 22, halign: 'left' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
      },
      alternateRowStyles: { fillColor: softFill(nivel) },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          data.cell.styles.textColor = levelFill(nivel);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = tableFinalY(doc, y) + 8;
  }

  return y;
}

function drawRelatorioTurmas(
  doc: jsPDF,
  autoTable: AutoTableFn,
  y: number,
  pageW: number,
  report: ProficiencyLevelsResponse,
  bandTitle: string
): number {
  const turmas = report.por_turma || [];
  if (!turmas.length) {
    y = ensureSpace(doc, y, 10, bandTitle);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text('Nenhuma turma no recorte.', MARGIN, y);
    return y + 8;
  }

  for (const turma of turmas) {
    const title = [turma.serie, turma.turma ? `Turma ${turma.turma}` : null]
      .filter(Boolean)
      .join(' — ') || 'Turma';
    const subtitle = [
      `${turma.alunos_avaliados ?? turma.alunos?.length ?? 0} alunos`,
      turma.media_acertos_percentual != null
        ? `média ${formatPercent(turma.media_acertos_percentual)}`
        : null,
      turma.turno || null,
    ]
      .filter(Boolean)
      .join(' · ');

    y = ensureSpace(doc, y, 28, bandTitle);
    doc.setFillColor(...C.bgLight);
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 12, 1, 1, 'F');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 12, 1, 1, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.text(title, MARGIN + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textGray);
    doc.text(subtitle, MARGIN + 3, y + 9.5);
    y += 14;

    // mini distribution bar
    const barW = pageW - MARGIN * 2;
    let x = MARGIN;
    LEVELS.forEach((nivel) => {
      const pct = turma.distribuicao?.[nivel]?.percentual ?? 0;
      if (pct <= 0) return;
      const w = (barW * Math.min(100, pct)) / 100;
      doc.setFillColor(...levelFill(nivel));
      doc.rect(x, y, w, 2.5, 'F');
      x += w;
    });
    y += 6;

    const alunos = turma.alunos || [];
    autoTable(doc, {
      startY: y,
      head: [['#', 'Aluno', 'Acertos', '%', 'Nota', 'Proficiência', 'Nível']],
      body: alunos.length
        ? alunos.map((a, i) => [
            String(i + 1),
            a.nome || '—',
            `${a.acertos ?? '—'}/${a.total_itens ?? '—'}`,
            formatPercent(a.percentual_acertos),
            formatNumber(a.nota),
            formatNumber(a.proficiencia),
            normalizeProficiencyLevelLabel(a.nivel),
          ])
        : [['—', 'Sem alunos', '—', '—', '—', '—', '—']],
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 1.8,
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
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 55, halign: 'left' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 28, halign: 'center' },
      },
      alternateRowStyles: { fillColor: C.bgLight },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 6) return;
        const raw = String(data.cell.raw ?? '');
        const fill = levelFill(raw);
        const text = levelText(raw);
        data.cell.styles.fillColor = fill;
        data.cell.styles.textColor = text;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 6.5;
      },
    });
    y = tableFinalY(doc, y) + 8;
  }

  return y;
}

const LINE_H = 4.2;
const GROUP_PAD = 4;
const GROUP_HEADER_H = 16;

function estimateGroupSegmentHeight(studentCount: number, showHeader: boolean): number {
  const header = showHeader ? GROUP_HEADER_H : 6;
  return header + studentCount * LINE_H + GROUP_PAD * 2 + 4;
}

function takeStudentsForPage(
  startY: number,
  pageH: number,
  remaining: ProficiencyLevelsAluno[],
  showHeader: boolean
): ProficiencyLevelsAluno[] {
  const header = showHeader ? GROUP_HEADER_H : 6;
  const available = pageH - SAFE_BOTTOM - startY - header - GROUP_PAD * 2 - 4;
  const maxLines = Math.max(1, Math.floor(available / LINE_H));
  return remaining.slice(0, maxLines);
}

function drawHomogeneousGroups(
  doc: jsPDF,
  y: number,
  pageW: number,
  groups: HomogeneousGroup[],
  maxPerClass: number,
  bandTitle: string
): number {
  y = ensureSpace(doc, y, 12, bandTitle);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  doc.text(
    `Sugestões por série e nível · até ${maxPerClass} alunos por turma`,
    MARGIN,
    y
  );
  y += 8;

  if (!groups.length) {
    doc.setFont('helvetica', 'italic');
    doc.text('Sem alunos suficientes para sugerir turmas.', MARGIN, y);
    return y + 8;
  }

  const contentW = pageW - MARGIN * 2;
  const pageH = doc.internal.pageSize.getHeight();

  groups.forEach((group, groupIdx) => {
    let remaining = [...group.alunos];
    let isFirst = true;

    while (remaining.length > 0) {
      const showHeader = isFirst;
      const minNeeded = estimateGroupSegmentHeight(1, showHeader);
      y = ensureSpace(doc, y, minNeeded, bandTitle);

      const segment = takeStudentsForPage(y, pageH, remaining, showHeader);
      const segH = estimateGroupSegmentHeight(segment.length, showHeader);

      // If even after ensureSpace the segment is taller than remaining page, force new page
      if (y + segH > pageH - SAFE_BOTTOM && segment.length > 0) {
        doc.addPage();
        drawTopBand(doc, pageW, bandTitle);
        y = TOP_BAND_H + 12;
      }

      const finalSegment = takeStudentsForPage(y, pageH, remaining, showHeader);
      const cardH = estimateGroupSegmentHeight(finalSegment.length, showHeader);

      doc.setFillColor(...softFill(group.nivel));
      doc.roundedRect(MARGIN, y, contentW, cardH, 1.5, 1.5, 'F');
      doc.setDrawColor(...levelFill(group.nivel));
      doc.setLineWidth(0.45);
      doc.roundedRect(MARGIN, y, contentW, cardH, 1.5, 1.5, 'S');

      let cy = y + GROUP_PAD + 3;
      if (showHeader) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...C.textDark);
        const title = `Grupo ${groupIdx + 1} · ${group.serie} · ${group.nivel}${
          isFirst ? '' : ' (cont.)'
        }`;
        doc.text(title, MARGIN + 4, cy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.textGray);
        cy += 5;
        doc.text(
          `${group.alunos.length} alunos · média ${formatPercent(group.mediaPercentual)} · origens: ${
            group.origens.join(' + ') || '—'
          }`,
          MARGIN + 4,
          cy
        );
        cy += 6;
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.textDark);
        doc.text(
          `Grupo ${groupIdx + 1} · ${group.serie} · ${group.nivel} (cont.)`,
          MARGIN + 4,
          cy
        );
        cy += 5;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.textDark);
      for (const aluno of finalSegment) {
        const left = aluno.nome || '—';
        const right = formatPercent(aluno.percentual_acertos);
        doc.text(left, MARGIN + 4, cy, { maxWidth: contentW - 28 });
        doc.text(right, MARGIN + contentW - 4, cy, { align: 'right' });
        cy += LINE_H;
      }

      y += cardH + 5;
      remaining = remaining.slice(finalSegment.length);
      isFirst = false;
    }
  });

  return y;
}

function drawHabilidades(
  doc: jsPDF,
  autoTable: AutoTableFn,
  y: number,
  report: ProficiencyLevelsResponse,
  bandTitle: string
): number {
  const list = [...(report.habilidades || [])].sort(
    (a, b) => Number(a.percentual_acertos ?? 0) - Number(b.percentual_acertos ?? 0)
  );

  if (!list.length) {
    y = ensureSpace(doc, y, 10, bandTitle);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text('Nenhuma habilidade no recorte.', MARGIN, y);
    return y + 8;
  }

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Componente', 'Série', '% Acertos', 'Nível']],
    body: list.map((h) => [
      h.codigo || '—',
      h.componente || h.descricao || '—',
      h.serie || '—',
      formatPercent(h.percentual_acertos),
      normalizeProficiencyLevelLabel(h.nivel),
    ]),
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.8,
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
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 32, halign: 'center' },
    },
    alternateRowStyles: { fillColor: C.bgLight },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return;
      const raw = String(data.cell.raw ?? '');
      data.cell.styles.fillColor = levelFill(raw);
      data.cell.styles.textColor = levelText(raw);
      data.cell.styles.fontStyle = 'bold';
      data.cell.styles.fontSize = 6.5;
    },
  });

  return tableFinalY(doc, y) + 6;
}

export type GenerateNiveisProficienciaPdfOpts = {
  report: ProficiencyLevelsResponse;
  fonteLabel: string;
  cityId?: string | null;
  maxPerHomogeneousClass?: number;
  fileName?: string;
};

export async function generateNiveisProficienciaPdf(
  opts: GenerateNiveisProficienciaPdfOpts
): Promise<void> {
  const {
    report,
    fonteLabel,
    cityId = null,
    maxPerHomogeneousClass = 15,
    fileName,
  } = opts;

  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dataGeracao = fmtNow();
  const bandTitle = `Níveis de Proficiência — ${fonteLabel}`;

  const resolvedCityId =
    cityId ||
    report.meta?.municipio_id ||
    (report.filtros_aplicados?.municipio && report.filtros_aplicados.municipio !== 'all'
      ? String(report.filtros_aplicados.municipio)
      : null);

  await drawCoverPage(doc, report, fonteLabel, resolvedCityId);

  doc.addPage();
  drawTopBand(doc, pageW, bandTitle);
  let y = TOP_BAND_H + 12;

  y = drawSectionTitle(doc, y, pageW, 'Indicadores gerais', bandTitle);
  y = drawKpiCards(doc, y, pageW, report);

  y = drawSectionTitle(doc, y, pageW, 'Escala de proficiência', bandTitle);
  y = drawEscala(doc, y, pageW, report.distribuicao, bandTitle);

  y = drawSectionTitle(doc, y, pageW, 'Alunos por nível de proficiência', bandTitle);
  y = drawAlunosPorNivel(doc, autoTable, y, pageW, report.alunos, bandTitle);

  y = drawSectionTitle(doc, y, pageW, 'Relatório detalhado por série e turma', bandTitle);
  y = drawRelatorioTurmas(doc, autoTable, y, pageW, report, bandTitle);

  y = drawSectionTitle(doc, y, pageW, 'Formação de turmas homogêneas', bandTitle);
  const groups = buildHomogeneousGroups(report.alunos, maxPerHomogeneousClass);
  y = drawHomogeneousGroups(doc, y, pageW, groups, maxPerHomogeneousClass, bandTitle);

  y = drawSectionTitle(doc, y, pageW, 'Habilidades por nível de domínio', bandTitle);
  drawHabilidades(doc, autoTable, y, report, bandTitle);

  addFooters(doc, dataGeracao);

  const safeTitle = (report.meta?.titulo || 'niveis-proficiencia')
    .replace(/[^\w\u00C0-\u024F\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  doc.save(fileName || `niveis-proficiencia-${safeTitle || 'relatorio'}.pdf`);
}
