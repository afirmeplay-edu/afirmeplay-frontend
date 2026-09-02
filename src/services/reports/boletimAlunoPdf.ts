import { jsPDF } from 'jspdf';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import { getBoletimMarkStatus, questionAlternativeLetters } from '@/utils/reports/boletimAlunoHelpers';
import type {
  BoletimAlunoItem,
  BoletimAlunoQuestao,
  BoletimAlunoReportFlow,
} from '@/types/boletim-aluno';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bgHeader: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
};

const MARGIN = 12;
const ROWS_PER_COL = 14;
const ROW_H = 6.2;
const COL_W_NUM = 11;
const COL_W_ALT = 9;
const COL_W_GAB = 12;

export type BoletimAlunoPdfLabels = {
  estado: string;
  municipio: string;
  avaliacao: string;
  escola?: string;
  serie?: string;
  turma?: string;
  aluno?: string;
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function tableWidth(letters: string[]): number {
  return COL_W_NUM + letters.length * COL_W_ALT + COL_W_GAB;
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

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed <= pageH - 14) return y;
  doc.addPage();
  return 16;
}

function drawCircle(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  status: 'correct' | 'wrong' | 'empty'
): void {
  if (status === 'correct') {
    doc.setFillColor(...C.green);
    doc.setDrawColor(...C.green);
    doc.circle(cx, cy, r, 'FD');
  } else if (status === 'wrong') {
    doc.setFillColor(...C.red);
    doc.setDrawColor(...C.red);
    doc.circle(cx, cy, r, 'FD');
  } else {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.circle(cx, cy, r, 'FD');
  }
}

function drawQuestionTable(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
  questoes: BoletimAlunoQuestao[],
  letters: string[]
): number {
  const w = tableWidth(letters);
  const headerH = 10;

  doc.setFillColor(...C.primary);
  doc.roundedRect(x, y, w, 6, 0.6, 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  const titleText = doc.splitTextToSize(title.toUpperCase(), w - 3) as string[];
  doc.text(titleText[0] || title, x + w / 2, y + 4, { align: 'center' });

  let cy = y + 6;
  doc.setFillColor(...C.bgHeader);
  doc.rect(x, cy, w, headerH - 4, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, cy, w, headerH - 4);

  const headers = ['#', ...letters, 'GAB'];
  const widths = [COL_W_NUM, ...letters.map(() => COL_W_ALT), COL_W_GAB];
  let hx = x;
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textDark);
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], hx + widths[i] / 2, cy + 4, { align: 'center' });
    hx += widths[i];
  }
  cy += headerH - 4;

  for (const q of questoes) {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.rect(x, cy, w, ROW_H, 'FD');
    let cx = x;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.text(`Q${q.numero}`, cx + COL_W_NUM / 2, cy + ROW_H / 2 + 1.1, { align: 'center' });
    cx += COL_W_NUM;

    for (const letter of letters) {
      const status = getBoletimMarkStatus(q, letter);
      drawCircle(doc, cx + COL_W_ALT / 2, cy + ROW_H / 2, 1.7, status);
      cx += COL_W_ALT;
    }

    doc.setFillColor(...C.green);
    doc.roundedRect(cx + 1.2, cy + 1.1, COL_W_GAB - 2.4, ROW_H - 2.2, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text(String(q.gabarito || '—').toUpperCase(), cx + COL_W_GAB / 2, cy + ROW_H / 2 + 1.1, {
      align: 'center',
    });
    cy += ROW_H;
  }

  return cy;
}

function drawCards(doc: jsPDF, y: number, item: BoletimAlunoItem): number {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = 4;
  const w = (pageW - MARGIN * 2 - gap * 3) / 4;
  const h = 18;
  const cards = [
    {
      title: 'ACERTOS TOTAIS',
      value: `${item.cards.acertos_totais.acertou} / ${item.cards.acertos_totais.total}`,
      sub: formatPercent1PtBr(item.cards.acertos_totais.percentual),
    },
    { title: 'NOTA', value: formatDecimal1PtBr(item.cards.nota), sub: '' },
    { title: 'PROFICIÊNCIA', value: formatDecimal1PtBr(item.cards.proficiencia), sub: '' },
    { title: 'NÍVEL GERAL', value: item.cards.nivel || '—', sub: '' },
  ];

  cards.forEach((card, i) => {
    const x = MARGIN + i * (w + gap);
    doc.setFillColor(...C.primary);
    doc.roundedRect(x, y, w, h, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text(card.title, x + w / 2, y + 5, { align: 'center' });
    doc.setFontSize(11);
    doc.text(String(card.value), x + w / 2, y + (card.sub ? 11 : 12.5), { align: 'center' });
    if (card.sub) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(card.sub, x + w / 2, y + 15.2, { align: 'center' });
    }
  });
  return y + h;
}

async function drawStudentBoletim(
  doc: jsPDF,
  item: BoletimAlunoItem,
  avaliacaoNome: string,
  labels: BoletimAlunoPdfLabels,
  cityId: string | null,
  isFirstPage: boolean
): Promise<void> {
  if (!isFirstPage) doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 10;

  const { logo } = await loadCityBrandingForReportPdf(cityId);
  if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
    const { w, h } = scaledSize(logo.iw, logo.ih, 22);
    doc.addImage(logo.dataUrl, 'PNG', pageW / 2 - w / 2, y, w, h);
    y += h + 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.primary);
  doc.text('BOLETIM DIAGNÓSTICO DO ALUNO', pageW / 2, y, { align: 'center' });
  y += 6;

  const lines = [
    ['AVALIAÇÃO', avaliacaoNome || labels.avaliacao],
    ['ESCOLA', item.aluno.escola || labels.escola || '—'],
    [
      'SÉRIE / TURMA',
      [item.aluno.serie || labels.serie, item.aluno.turma || labels.turma]
        .filter(Boolean)
        .join('  |  ') || '—',
    ],
    ['ALUNO', item.aluno.nome],
  ];
  if (item.aluno.matricula) lines.push(['MATRÍCULA', item.aluno.matricula]);

  doc.setFontSize(8);
  for (const [k, v] of lines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    const label = `${k}: `;
    const lw = doc.getTextWidth(label);
    doc.setTextColor(...C.textDark);
    doc.text(label, pageW / 2 - 70, y);
    doc.setFont('helvetica', 'normal');
    const value = doc.splitTextToSize(String(v || '—').toUpperCase(), 140) as string[];
    doc.text(value[0] || '—', pageW / 2 - 70 + lw, y);
    y += 4.4;
  }

  y += 3;

  for (const bloco of item.por_disciplina ?? []) {
    const letters = questionAlternativeLetters(bloco.questoes);
    const columns = chunk(bloco.questoes ?? [], ROWS_PER_COL);
    const colW = tableWidth(letters);
    const gap = 4;
    const blockH = 6 + 6 + columns[0]?.length * ROW_H + 4;
    y = ensureSpace(doc, y, Math.min(blockH, 40));

    let x = MARGIN;
    let rowBottom = y;
    columns.forEach((col, idx) => {
      if (x + colW > pageW - MARGIN) {
        x = MARGIN;
        y = rowBottom + 4;
        y = ensureSpace(doc, y, 20);
      }
      const bottom = drawQuestionTable(doc, x, y, bloco.disciplina, col, letters);
      rowBottom = Math.max(rowBottom, bottom);
      x += colW + gap;
      if (idx === columns.length - 1) y = rowBottom + 5;
    });
    if (columns.length === 0) {
      doc.setFontSize(8);
      doc.setTextColor(...C.textGray);
      doc.text(`Nenhuma questão em ${bloco.disciplina}.`, MARGIN, y);
      y += 6;
    }
  }

  y = ensureSpace(doc, y + 2, 22);
  drawCards(doc, y, item);
}

export async function generateBoletimAlunoPdf(options: {
  boletins: BoletimAlunoItem[];
  avaliacaoNome: string;
  labels: BoletimAlunoPdfLabels;
  cityId: string | null;
  flow: BoletimAlunoReportFlow;
}): Promise<void> {
  const { boletins, avaliacaoNome, labels, cityId, flow } = options;
  if (!boletins.length) throw new Error('Não há boletins para exportar.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dataGeracao = fmtNow();

  for (let i = 0; i < boletins.length; i++) {
    await drawStudentBoletim(doc, boletins[i], avaliacaoNome, labels, cityId, i === 0);
  }

  addFooters(doc, dataGeracao);

  const mode = flow === 'cartao' ? 'cartao' : 'online';
  const alunoPart =
    boletins.length === 1
      ? boletins[0].aluno.nome.replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 40)
      : 'turma';
  doc.save(`boletim-aluno-${mode}-${alunoPart || 'relatorio'}.pdf`);
}
