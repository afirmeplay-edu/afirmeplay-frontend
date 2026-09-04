import { jsPDF } from 'jspdf';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import { formatPercent1PtBr } from '@/utils/numberFormat';
import type {
  MapaQuestoesMarcacao,
  MapaQuestoesPorDisciplina,
  MapaQuestoesQuestao,
  MapaQuestoesReportFlow,
  MapaQuestoesResumo,
} from '@/types/mapa-questoes';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bgHeader: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
};

const MARGIN = 12;
const TOP_BAND_H = 14;

export type MapaQuestoesPdfLabels = {
  estado: string;
  municipio: string;
  avaliacao: string;
  escola?: string;
  serie?: string;
  turma?: string;
};

type HabilidadePdfSource = {
  habilidade?: string;
  /** Reservado: o resumo ainda não envia este campo (item 2 do diagnóstico). */
  habilidade_descricao?: string;
};

/**
 * Coluna Habilidade do PDF.
 * Hoje devolve só o código. Quando o backend passar `habilidade_descricao`,
 * ligar `includeDescription: true` nesta chamada — sem mudar colunas/layout.
 */
function habilidadePdfText(
  q: HabilidadePdfSource,
  opts: { includeDescription?: boolean } = {}
): string {
  const code = (q.habilidade || '').trim() || '—';
  const desc = opts.includeDescription ? (q.habilidade_descricao || '').trim() : '';
  if (desc) return `${code} — ${desc}`;
  return code;
}

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

function pdfValue(value: string | number | null | undefined, empty = 'Não informado'): string {
  if (value === null || value === undefined) return empty;
  const s = String(value).trim();
  return s || empty;
}

function extractYear(...texts: Array<string | undefined>): string {
  for (const text of texts) {
    const match = String(text || '').match(/\b(20\d{2})\b/);
    if (match?.[1]) return match[1];
  }
  return 'Não informado';
}

function componenteLabel(report: MapaQuestoesResumo): string {
  const isGeneric = (n: string) => {
    const k = n.toLowerCase();
    return !n || k === 'sem disciplina' || k === 'geral' || k === 'outras';
  };
  const nomes = (report.avaliacao.disciplinas ?? [])
    .map((d) => (d.nome || '').trim())
    .filter((n) => !isGeneric(n));
  const fromBlocos = (report.por_disciplina ?? [])
    .map((b) => (b.disciplina || '').trim())
    .filter((n) => !isGeneric(n));
  const unique = [...new Set(nomes.length ? nomes : fromBlocos)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return 'Todas';
  return 'Não informado';
}

function prefeituraTitle(municipio: string | undefined): string {
  const raw = pdfValue(municipio, 'MUNICÍPIO').toLocaleUpperCase('pt-BR');
  if (raw === 'ALL' || raw === 'TODAS' || raw === 'TODOS') return 'PREFEITURA DE MUNICÍPIO';
  if (raw.startsWith('PREFEITURA')) return raw;
  return `PREFEITURA DE ${raw}`;
}

function fitOneLine(doc: jsPDF, text: string, maxW: number): string {
  const value = pdfValue(text);
  if (doc.getTextWidth(value) <= maxW) return value;
  let t = value;
  const ellipsis = '…';
  while (t.length > 1 && doc.getTextWidth(`${t}${ellipsis}`) > maxW) {
    t = t.slice(0, -1);
  }
  return `${t}${ellipsis}`;
}

function drawMetaField(
  doc: jsPDF,
  x: number,
  y: number,
  maxW: number,
  label: string,
  value: string
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.textDark);
  const labelText = `${label}: `;
  const lw = doc.getTextWidth(labelText);
  doc.text(labelText, x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fitOneLine(doc, value, Math.max(12, maxW - lw)), x + lw, y);
}

function drawDesempenhoHeader(
  doc: jsPDF,
  report: MapaQuestoesResumo,
  labels: MapaQuestoesPdfLabels,
  logo: { dataUrl: string; iw: number; ih: number } | null
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;
  let y = 5;

  if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
    const { w, h } = scaledSize(logo.iw, logo.ih, 18, 8);
    doc.addImage(logo.dataUrl, 'PNG', centerX - w / 2, y, w, h);
    y += h + 2.2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.textDark);
  doc.text(prefeituraTitle(labels.municipio), centerX, y, { align: 'center' });
  y += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
  y += 4.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('RELATÓRIO DE DESEMPENHO POR QUESTÃO', centerX, y, { align: 'center' });
  y += 3.4;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 3.2;

  const escola = labels.escola?.trim() || 'Todas';
  const serie = labels.serie?.trim() || 'Todas';
  const turma = labels.turma?.trim() || 'Todas';
  const avaliacao = pdfValue(report.avaliacao.nome || labels.avaliacao);
  const ano = extractYear(avaliacao, serie, labels.avaliacao);
  const colW = (pageW - MARGIN * 2 - 8) / 3;
  const colX = [MARGIN + 3, MARGIN + 3 + colW + 4, MARGIN + 3 + (colW + 4) * 2];
  const rowH = 4.3;
  const boxH = 3 + rowH * 3 + 2.2;

  doc.setDrawColor(...C.border);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, boxH, 1.2, 1.2, 'FD');

  const row1 = y + 5;
  drawMetaField(doc, colX[0], row1, colW, 'Avaliação', avaliacao);
  drawMetaField(doc, colX[1], row1, colW, 'Escola', escola);
  drawMetaField(doc, colX[2], row1, colW, 'Ano', ano);

  const row2 = row1 + rowH;
  drawMetaField(doc, colX[0], row2, colW, 'Série', serie);
  drawMetaField(doc, colX[1], row2, colW, 'Turma', turma);
  drawMetaField(doc, colX[2], row2, colW, 'Etapa', 'Não informado');

  const row3 = row2 + rowH;
  drawMetaField(
    doc,
    colX[0],
    row3,
    colW,
    'Total de Alunos Avaliados',
    formatNumber(report.metricas.total_alunos_realizaram)
  );
  drawMetaField(
    doc,
    colX[1],
    row3,
    colW,
    'Média de Acertos da Prova',
    formatPercent1PtBr(report.metricas.media_acertos_percentual)
  );
  drawMetaField(doc, colX[2], row3, colW, 'Componente', componenteLabel(report));

  return y + boxH + 4;
}

function scaledSize(iw: number, ih: number, desiredW: number, maxH: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: Math.min(desiredW * 0.3, maxH) };
  let w = desiredW;
  let h = (ih * w) / iw;
  if (h > maxH) {
    h = maxH;
    w = (iw * h) / ih;
  }
  return { w, h };
}

function completeMarcacoes(
  marcacoes: MapaQuestoesMarcacao[] | undefined,
  gabarito: string
): MapaQuestoesMarcacao[] {
  const byAlt = new Map<string, MapaQuestoesMarcacao>();
  for (const item of marcacoes ?? []) {
    if (item.alternativa === 'sem_resposta') continue;
    byAlt.set(item.alternativa.toUpperCase(), item);
  }
  const lettersInData = [...byAlt.keys()].filter((key) => /^[A-E]$/.test(key));
  if (/^[A-E]$/i.test(gabarito)) lettersInData.push(gabarito.toUpperCase());
  const lastCode = Math.max(
    'D'.charCodeAt(0),
    ...lettersInData.map((letter) => letter.charCodeAt(0))
  );
  const completed: MapaQuestoesMarcacao[] = [];
  for (let code = 65; code <= lastCode && code <= 69; code++) {
    const alt = String.fromCharCode(code);
    completed.push(byAlt.get(alt) ?? { alternativa: alt, alunos: 0, percentual: 0 });
  }
  return completed;
}

function lettersForBloco(bloco: MapaQuestoesPorDisciplina): string[] {
  const seen = new Set<string>();
  for (const q of bloco.questoes ?? []) {
    for (const m of completeMarcacoes(q.marcacoes, q.gabarito)) {
      seen.add(m.alternativa);
    }
  }
  return ['A', 'B', 'C', 'D', 'E'].filter((l) => seen.has(l));
}

function semResposta(q: MapaQuestoesQuestao): MapaQuestoesMarcacao {
  const found = (q.marcacoes ?? []).find((item) => item.alternativa === 'sem_resposta');
  return found ?? { alternativa: 'sem_resposta', alunos: 0, percentual: 0 };
}

function addFooters(doc: jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, pageH - 9, pageW - MARGIN, pageH - 9);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text('AfirmePlay: Sistema de Ensino e Avaliação', MARGIN, pageH - 5.5);
    doc.text(`Página ${i} de ${n}`, pageW / 2, pageH - 5.5, { align: 'center' });
    doc.text(`Gerado em ${dataGeracao}`, pageW - MARGIN, pageH - 5.5, { align: 'right' });
  }
}

function drawTopBand(doc: jsPDF, title: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, TOP_BAND_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.white);
  const t = doc.splitTextToSize(title.toUpperCase(), pageW - MARGIN * 2) as string[];
  doc.text(t[0] || title, pageW / 2, 9, { align: 'center' });
}

function tableFinalY(doc: jsPDF, fallback: number): number {
  const ly = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return typeof ly === 'number' ? ly : fallback;
}

export async function generateMapaQuestoesPdf(options: {
  report: MapaQuestoesResumo;
  labels: MapaQuestoesPdfLabels;
  cityId: string | null;
  flow: MapaQuestoesReportFlow;
}): Promise<void> {
  const { report, labels, cityId, flow } = options;
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dataGeracao = fmtNow();
  const modeLabel = flow === 'cartao' ? 'Cartão-resposta' : 'Avaliação online';
  const bandTitle = `Mapa de questões — ${modeLabel}`;
  const decoratedPages = new Set<number>([1]);

  const decorateOverflowPage = () => {
    const page = doc.internal.getCurrentPageInfo().pageNumber;
    if (decoratedPages.has(page)) return;
    decoratedPages.add(page);
    drawTopBand(doc, `${bandTitle} — ${report.avaliacao.nome || labels.avaliacao}`);
  };

  const { logo } = await loadCityBrandingForReportPdf(cityId);
  let y = drawDesempenhoHeader(doc, report, labels, logo);

  const blocos = report.por_disciplina ?? [];
  if (!blocos.length) {
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text('Não há questões no recorte selecionado.', MARGIN, y);
  }

  for (const bloco of blocos) {
    const letters = lettersForBloco(bloco);
    const head = [
      'Questão',
      'Disciplina',
      'Habilidade',
      'Gabarito',
      'Taxa de acertos',
      ...letters.map((l) => `Marc. ${l}`),
      'Sem resposta',
    ];
    const body = (bloco.questoes ?? []).map((q) => {
      const marks = completeMarcacoes(q.marcacoes, q.gabarito);
      const byAlt = new Map(marks.map((m) => [m.alternativa, m]));
      const blank = semResposta(q);
      const taxa = `${formatPercent1PtBr(q.taxa_acertos.percentual)} (${formatNumber(q.taxa_acertos.acertaram)} de ${formatNumber(q.taxa_acertos.total)})`;
      return [
        `Q${q.numero}`,
        q.disciplina || bloco.disciplina || '—',
        habilidadePdfText(q, { includeDescription: false }),
        String(q.gabarito || '—').toUpperCase(),
        taxa,
        ...letters.map((l) => {
          const m = byAlt.get(l);
          if (!m) return '0,0% (0)';
          return `${formatPercent1PtBr(m.percentual)} (${formatNumber(m.alunos)})`;
        }),
        `${formatPercent1PtBr(blank.percentual)} (${formatNumber(blank.alunos)})`,
      ];
    });

    const gabCol = 3;
    const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 32, halign: 'left' },
      2: { cellWidth: 28, halign: 'left' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 36, halign: 'left' },
    };
    const restCols = letters.length + 1;
    const used = 16 + 32 + 28 + 18 + 36;
    const restW = Math.max(18, (pageW - MARGIN * 2 - used) / Math.max(restCols, 1));
    for (let i = 0; i < restCols; i++) {
      columnStyles[5 + i] = { cellWidth: restW, halign: 'center' };
    }

    doc.setFillColor(...C.primary);
    const bannerH = 7;
    const pageH = doc.internal.pageSize.getHeight();
    if (y + bannerH + 18 > pageH - 16) {
      doc.addPage();
      decorateOverflowPage();
      y = TOP_BAND_H + 8;
    }
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, bannerH, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    const nQ = bloco.questoes?.length ?? 0;
    doc.text(
      `${bloco.disciplina || 'Disciplina'}  ·  ${nQ} questão(ões)`,
      MARGIN + 3,
      y + 4.8
    );
    y += bannerH + 1.5;

    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [['—', 'Sem questões nesta disciplina', '', '', '', ...letters.map(() => ''), '']],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 1.2,
        textColor: C.textDark,
        lineColor: C.border,
        lineWidth: 0.15,
        overflow: 'linebreak',
        valign: 'middle',
        minCellHeight: 6,
      },
      headStyles: {
        fillColor: C.bgHeader,
        textColor: C.textDark,
        fontStyle: 'bold',
        fontSize: 6.5,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles,
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: MARGIN, right: MARGIN, top: TOP_BAND_H + 6, bottom: 16 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === gabCol) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = C.white;
          data.cell.styles.fillColor = C.green;
          data.cell.styles.halign = 'center';
        }
      },
      didDrawPage: () => {
        decorateOverflowPage();
      },
    });
    y = tableFinalY(doc, y) + 6;
  }

  addFooters(doc, dataGeracao);

  const mode = flow === 'cartao' ? 'cartao' : 'online';
  const nome = (report.avaliacao.nome || 'relatorio').replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 50);
  doc.save(`mapa-questoes-${mode}-${nome || 'relatorio'}.pdf`);
}
