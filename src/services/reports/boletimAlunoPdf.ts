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
const ROW_H = 6.2;
const TABLE_TITLE_H = 6;
const TABLE_HEADER_H = 6;
const TABLE_COLUMN_COUNT = 4;
const TABLE_GAP = 4;
const COL_W_NUM = 14;
const COL_W_GAB = 18;
const CONTENT_BOTTOM_GAP = 14;
const CARDS_HEIGHT = 18;
const CARDS_GAP = 5;

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
  width: number,
  title: string,
  questoes: BoletimAlunoQuestao[],
  letters: string[]
): number {
  doc.setFillColor(...C.primary);
  doc.roundedRect(x, y, width, TABLE_TITLE_H, 0.6, 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  const titleText = doc.splitTextToSize(title.toUpperCase(), width - 3) as string[];
  doc.text(titleText[0] || title, x + width / 2, y + 4, { align: 'center' });

  let cy = y + TABLE_TITLE_H;
  doc.setFillColor(...C.bgHeader);
  doc.rect(x, cy, width, TABLE_HEADER_H, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, cy, width, TABLE_HEADER_H);

  const headers = ['#', ...letters, 'GAB'];
  const alternativesWidth = Math.max(1, width - COL_W_NUM - COL_W_GAB);
  const alternativeColumnWidth = alternativesWidth / Math.max(1, letters.length);
  const widths = [
    COL_W_NUM,
    ...letters.map(() => alternativeColumnWidth),
    COL_W_GAB,
  ];
  let hx = x;
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textDark);
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], hx + widths[i] / 2, cy + 4, { align: 'center' });
    hx += widths[i];
  }
  cy += TABLE_HEADER_H;

  for (const q of questoes) {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.rect(x, cy, width, ROW_H, 'FD');
    let cx = x;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.text(`Q${q.numero}`, cx + COL_W_NUM / 2, cy + ROW_H / 2 + 1.1, { align: 'center' });
    cx += COL_W_NUM;

    for (const letter of letters) {
      const status = getBoletimMarkStatus(q, letter);
      drawCircle(doc, cx + alternativeColumnWidth / 2, cy + ROW_H / 2, 1.7, status);
      cx += alternativeColumnWidth;
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
  const h = CARDS_HEIGHT;
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
  const pageH = doc.internal.pageSize.getHeight();
  const contentBottom = pageH - CONTENT_BOTTOM_GAP;
  const slotWidth =
    (pageW - MARGIN * 2 - TABLE_GAP * (TABLE_COLUMN_COUNT - 1)) /
    TABLE_COLUMN_COUNT;
  const headerTop = 10;
  let logoWidth = 0;
  let logoBottom = headerTop;

  const { logo } = await loadCityBrandingForReportPdf(cityId);
  if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
    const { w, h } = scaledSize(logo.iw, logo.ih, 22);
    logoWidth = w;
    logoBottom = headerTop + h;
    doc.addImage(
      logo.dataUrl,
      'PNG',
      pageW - MARGIN - w,
      headerTop,
      w,
      h
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.primary);
  const titleY = headerTop + 6;
  doc.text('BOLETIM DO ALUNO', MARGIN, titleY);

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

  let y = titleY + 7;
  const detailsWidth = pageW - MARGIN * 2 - (logoWidth > 0 ? logoWidth + 8 : 0);
  doc.setFontSize(8);
  for (const [k, v] of lines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    const label = `${k}: `;
    const lw = doc.getTextWidth(label);
    doc.setTextColor(...C.textDark);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    const value = doc.splitTextToSize(
      String(v || '—').toUpperCase(),
      Math.max(40, detailsWidth - lw)
    ) as string[];
    doc.text(value[0] || '—', MARGIN + lw, y);
    y += 4.4;
  }

  y = Math.max(y + 3, logoBottom + 4);

  const drawContinuationHeader = (): number => {
    const top = 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.primary);
    doc.text('BOLETIM DO ALUNO — CONTINUAÇÃO', MARGIN, top);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.textDark);
    const studentLabel = doc.splitTextToSize(
      `${item.aluno.nome} | ${avaliacaoNome || labels.avaliacao}`,
      pageW - MARGIN * 2
    ) as string[];
    doc.text(studentLabel[0] || item.aluno.nome, pageW - MARGIN, top, {
      align: 'right',
    });
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, top + 4, pageW - MARGIN, top + 4);
    return top + 8;
  };

  let contentTop = y;
  let currentSlot = 0;
  let needsNewPage =
    contentTop + TABLE_TITLE_H + TABLE_HEADER_H + ROW_H > contentBottom;
  let slotBottoms: number[] = Array(TABLE_COLUMN_COUNT).fill(contentTop);
  let pageReservesCards = false;

  const ensureSlotPage = (): void => {
    if (!needsNewPage) return;
    doc.addPage();
    contentTop = drawContinuationHeader();
    currentSlot = 0;
    slotBottoms = Array(TABLE_COLUMN_COUNT).fill(contentTop);
    pageReservesCards = false;
    needsNewPage = false;
  };

  const finishSlot = (bottom: number): void => {
    slotBottoms[currentSlot] = bottom;
    if (currentSlot === TABLE_COLUMN_COUNT - 1) {
      currentSlot = 0;
      needsNewPage = true;
    } else {
      currentSlot += 1;
    }
  };

  const disciplineBlocks = item.por_disciplina ?? [];
  const cardsTableBottom = contentBottom - CARDS_HEIGHT - CARDS_GAP;

  const countRemainingSlots = (
    startBlockIndex: number,
    startQuestionIndex: number,
    rowsPerSlot: number
  ): number => {
    let slots = 0;
    for (
      let index = startBlockIndex;
      index < disciplineBlocks.length;
      index += 1
    ) {
      const totalRows = disciplineBlocks[index].questoes?.length ?? 0;
      const remainingRows =
        index === startBlockIndex
          ? Math.max(0, totalRows - startQuestionIndex)
          : totalRows;
      slots += Math.max(1, Math.ceil(remainingRows / rowsPerSlot));
    }
    return slots;
  };

  for (let blockIndex = 0; blockIndex < disciplineBlocks.length; blockIndex += 1) {
    const bloco = disciplineBlocks[blockIndex];
    const questions = bloco.questoes ?? [];
    const letters = questionAlternativeLetters(questions);
    let questionIndex = 0;
    let renderedEmptyDiscipline = false;

    while (questionIndex < questions.length || !renderedEmptyDiscipline) {
      ensureSlotPage();
      const rowsPerReservedSlot = Math.max(
        1,
        Math.floor(
          (cardsTableBottom - contentTop - TABLE_TITLE_H - TABLE_HEADER_H) /
            ROW_H
        )
      );
      const remainingReservedSlots = countRemainingSlots(
        blockIndex,
        questionIndex,
        rowsPerReservedSlot
      );

      // Assim que todo o conteúdo restante couber numa página com a faixa
      // inferior reservada, essa passa a ser a página final. Se a página
      // atual já usou a altura integral, o sufixo começa na próxima página.
      if (
        !pageReservesCards &&
        currentSlot > 0 &&
        remainingReservedSlots <= TABLE_COLUMN_COUNT
      ) {
        needsNewPage = true;
        ensureSlotPage();
        continue;
      }

      if (currentSlot === 0) {
        pageReservesCards = remainingReservedSlots <= TABLE_COLUMN_COUNT;
      }

      const tableBottom = pageReservesCards ? cardsTableBottom : contentBottom;
      const availableHeight = tableBottom - contentTop;
      const rowsThatFit = Math.max(
        1,
        Math.floor(
          (availableHeight - TABLE_TITLE_H - TABLE_HEADER_H) / ROW_H
        )
      );
      const rows =
        questions.length > 0
          ? questions.slice(questionIndex, questionIndex + rowsThatFit)
          : [];
      const x = MARGIN + currentSlot * (slotWidth + TABLE_GAP);
      const bottom = drawQuestionTable(
        doc,
        x,
        contentTop,
        slotWidth,
        bloco.disciplina,
        rows,
        letters
      );

      questionIndex += rows.length;
      renderedEmptyDiscipline = true;
      finishSlot(bottom);

      if (questions.length === 0 || questionIndex >= questions.length) {
        break;
      }
    }
  }

  const cardsY = Math.max(...slotBottoms) + CARDS_GAP;
  if (cardsY + CARDS_HEIGHT <= contentBottom) {
    drawCards(doc, cardsY, item);
  } else {
    // Defesa para dados fora do contrato (por exemplo, cabeçalho maior que a
    // área útil). No fluxo normal, a reserva dinâmica acima evita este caso.
    doc.addPage();
    const continuationTop = drawContinuationHeader();
    drawCards(doc, continuationTop + 2, item);
  }
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
