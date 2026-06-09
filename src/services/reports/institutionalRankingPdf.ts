/**
 * PDF do ranking agregado (escolas / séries / turmas) na aba Estatísticas dos resultados por filtros.
 * Não altera o ranking de alunos (`rankingPdf.ts`).
 */
import { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';

export type InstitutionalRankingPdfFilterLabels = {
  estado: string;
  municipio: string;
  escola: string;
  serie: string;
  turma: string;
};

export type InstitutionalRankingPdfRow = {
  nome: string;
  serieLinha?: string;
  totalAlunos: number;
  participantes: number;
  mediaNota: number;
  proficiencia: number;
};

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
  let yTop = titleY;

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
  doc.text('Filtros aplicados', margin + 10, cy);
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
  doc.text('Ranking agregado conforme filtros e permissão do usuário.', centerX, y, { align: 'center' });
}

export async function generateInstitutionalRankingPdf(opts: {
  escopoTitulo?: string;
  filterLabels: InstitutionalRankingPdfFilterLabels;
  /** Cabeçalho da 2ª coluna (ex.: Escola, Turma, Série — Turma). */
  colEntidade: string;
  rows: InstitutionalRankingPdfRow[];
  fileNameBase?: string;
  /** UUID do município para logo municipal no PDF. */
  cityId?: string | null;
}): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  const filters = opts.filterLabels;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const escopo = (opts.escopoTitulo ?? '').trim() || '—';
  await addCover(
    doc,
    'RANKING AGREGADO',
    'Desempenho por escola, série ou turma (conforme recorte)',
    escopo,
    opts.cityId ?? null
  );

  doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 16;

  const filterLines = [
    `Estado: ${filters.estado}`,
    `Município: ${filters.municipio}`,
    `Escola: ${filters.escola}`,
    `Série: ${filters.serie}`,
    `Turma: ${filters.turma}`,
  ];
  y = drawFiltersCard(doc, margin, pageW, y, filterLines);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text('Ranking (maior média / proficiência primeiro)', margin, y);
  y += 9;

  const rows = opts.rows;
  const empty = rows.length === 0;
  const head = [['#', opts.colEntidade, 'Alunos', 'Partic.', 'Média', 'Profic.']];
  const body = empty
    ? [['—', 'Nenhum registro no recorte permitido para seu perfil', '', '', '', '']]
    : rows.map((r, i) => [
        `${i + 1}º`,
        r.serieLinha ? `${r.nome} (${r.serieLinha})` : r.nome,
        String(r.totalAlunos),
        String(r.participantes),
        Number(r.mediaNota).toFixed(1),
        Number(r.proficiencia).toFixed(1),
      ]);

  const tableOptions: UserOptions = {
    head,
    body,
    startY: y,
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
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 'auto', minCellWidth: 42 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: C.primary },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: C.primary },
    },
    didParseCell: (hookData) => {
      if (empty && hookData.section === 'body') {
        hookData.cell.styles.fillColor = C.bgLight;
        hookData.cell.styles.textColor = C.textGray;
        hookData.cell.styles.fontStyle = 'italic';
      }
    },
  };

  autoTable(doc, tableOptions);
  addFootersAllPages(doc);

  const rawBase = (opts.fileNameBase ?? 'ranking-agregado-resultados').trim();
  const safeNameBase =
    rawBase
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'ranking-agregado-resultados';

  doc.save(`${safeNameBase}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
