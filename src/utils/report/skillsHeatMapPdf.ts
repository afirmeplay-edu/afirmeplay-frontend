import { jsPDF } from 'jspdf';
import type {
  SkillsMapAlunoLinha,
  SkillsMapErrosResponse,
  SkillsMapHabilidade,
  SkillsMapResponse,
} from '@/services/evaluation/skillsMapApi';

import { loadCityBrandingForReportPdf, urlToPngAsset } from '@/utils/pdfCityBranding';

import { getClassShiftLabel } from '@/lib/classShift';

import {
  buildStructuredIaSegmentsFromRoot,
  hasAnyStructuredIaContent,
  renderStructuredIaPdfContent,
} from '@/utils/report/analiseIaPdfStructured';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface SkillsHeatMapPdfMeta {
  estado?: string;
  municipio?: string;
  /** UUID do município para logo municipal no PDF. */
  municipioId?: string;
  avaliacao?: string;
  gabarito?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  shift?: string;
  disciplina?: string;
}

// ---------------------------------------------------------------------------
// Paleta institucional (igual a evolutionPdfService)
// ---------------------------------------------------------------------------

const C = {
  primary:     [124, 62, 237] as [number, number, number],
  textDark:    [31, 41, 55]   as [number, number, number],
  textGray:    [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight:     [250, 250, 250] as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  green:       [16, 185, 129]  as [number, number, number],
  red:         [239, 68, 68]   as [number, number, number],
};

// ---------------------------------------------------------------------------
// Constantes de faixas
// ---------------------------------------------------------------------------

const FAIXA_ORDER = ['abaixo_do_basico', 'basico', 'adequado', 'avancado'] as const;
type Faixa = (typeof FAIXA_ORDER)[number];

const FAIXA_LABELS: Record<Faixa, string> = {
  abaixo_do_basico: '0–29% Abaixo do Básico',
  basico:           '30–59% Básico',
  adequado:         '60–79% Adequado',
  avancado:         '80–100% Avançado',
};

const FAIXA_COLORS: Record<Faixa, [number, number, number]> = {
  abaixo_do_basico: [220, 38, 38],
  basico:           [251, 191, 36],
  adequado:         [163, 230, 53],
  avancado:         [4, 120, 87],
};

// Cores dos cards das habilidades (espelha visual do heatmap no front-end).
const FAIXA_CARD_BG: Record<Faixa, [number, number, number]> = {
  abaixo_do_basico: [220, 38, 38],   // red-600
  basico:           [251, 191, 36],  // amber-400
  adequado:         [163, 230, 53],  // lime-400
  avancado:         [4, 120, 87],    // emerald-700
};

const FAIXA_CARD_TEXT: Record<Faixa, [number, number, number]> = {
  abaixo_do_basico: [255, 255, 255],
  basico:           [69, 26, 3],     // amber-950
  adequado:         [2, 44, 34],     // emerald-950
  avancado:         [255, 255, 255],
};

const LEGEND_STOPS: Array<[number, number, number]> = [
  [220, 38, 38],
  [251, 191, 36],
  [163, 230, 53],
  [4, 120, 87],
];

/** Rótulo curto da faixa (colunas de tabela). */
const FAIXA_SHORT: Record<Faixa, string> = {
  abaixo_do_basico: 'Abaixo do Básico',
  basico: 'Básico',
  adequado: 'Adequado',
  avancado: 'Avançado',
};

function disciplineLabel(h: SkillsMapHabilidade): string {
  const n = h.disciplina_nome?.trim();
  return n || 'Sem disciplina';
}

/** Agrupa todas as habilidades do mapa por disciplina; ordena por faixa e código dentro de cada grupo. */
function collectSkillsGroupedByDiscipline(map: SkillsMapResponse): Map<string, SkillsMapHabilidade[]> {
  const m = new Map<string, SkillsMapHabilidade[]>();
  for (const faixa of FAIXA_ORDER) {
    for (const h of map.por_faixa?.[faixa] ?? []) {
      const k = disciplineLabel(h);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    }
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const ia = FAIXA_ORDER.indexOf(a.faixa);
      const ib = FAIXA_ORDER.indexOf(b.faixa);
      if (ia !== ib) return ia - ib;
      return (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR');
    });
  }
  return m;
}

function sortedDisciplineNames(grouped: Map<string, SkillsMapHabilidade[]>): string[] {
  const names = [...grouped.keys()];
  names.sort((a, b) => {
    if (a === 'Sem disciplina') return 1;
    if (b === 'Sem disciplina') return -1;
    return a.localeCompare(b, 'pt-BR');
  });
  return names;
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

// ---------------------------------------------------------------------------
// Helpers genéricos
// ---------------------------------------------------------------------------

function fmtNow(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function wrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines as string[], x, y);
  return y + (lines as string[]).length * lineH;
}

function scaledSize(iw: number, ih: number, desiredW: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
}

// ---------------------------------------------------------------------------
// Rodapé em todas as páginas
// ---------------------------------------------------------------------------

function addFooters(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    // linha separadora
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.text('Afirme Play Soluções Educativas', margin, pageH - 9);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 9, { align: 'center' });
    doc.text(fmtNow(), pageW - margin, pageH - 9, { align: 'right' });
  }
}

// ---------------------------------------------------------------------------
// Cabeçalho de páginas internas
// ---------------------------------------------------------------------------

function addPageHeader(
  doc: jsPDF,
  sectionTitle: string,
  municipio?: string,
  ico?: { dataUrl: string; iw: number; ih: number } | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const centerX = pageW / 2;
  const BAND_H = 20;

  // Faixa compacta
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, 'F');

  // Ícone
  if (ico?.dataUrl && ico.iw > 0 && ico.ih > 0) {
    const icoH = 14;
    const icoW = (ico.iw * icoH) / ico.ih;
    doc.addImage(ico.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text('MAPA DE HABILIDADES', pageW - margin, BAND_H / 2 + 2, { align: 'right' });

  let y = BAND_H + 8;
  if (municipio?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.textGray);
    doc.text(municipio.toUpperCase(), centerX, y, { align: 'center', maxWidth: pageW - 2 * margin });
    y += 6;
  }

  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(sectionTitle, margin, y);
  y += 7;

  return y;
}

// ---------------------------------------------------------------------------
// Capa (cover page) — compartilhada entre PDF geral e por habilidade
// ---------------------------------------------------------------------------

type AddCoverPageOptions = {
  /** Capa do PDF detalhe da habilidade: só avaliação/gabarito, município, escopo e disciplina */
  skillDetail?: boolean;
  /** Disciplina no card quando o filtro “todas” não preenche meta.disciplina */
  skillDisciplinaFallback?: string | null;
};

async function addCoverPage(
  doc: jsPDF,
  title: string,
  subtitle: string,
  meta: SkillsHeatMapPdfMeta,
  extraCardLines: Array<{ label: string; value: string }>,
  coverOptions?: AddCoverPageOptions,
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 58;

  // Fundo branco
  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Faixa superior roxa
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, 'F');

  // Logo na faixa
  let logoBottomInBand = 0;
  const cityId = meta.municipioId && meta.municipioId !== 'all' ? meta.municipioId : null;
  const { logo: logoAsset } = await loadCityBrandingForReportPdf(cityId);
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 38);
    doc.addImage(logoAsset.dataUrl, 'PNG', centerX - w / 2, 7, w, h);
    logoBottomInBand = 7 + h;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('AFIRME PLAY', centerX, 22, { align: 'center' });
    logoBottomInBand = 28;
  }

  // Título na faixa
  const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title, centerX, titleY, { align: 'center' });
  doc.setFontSize(11);
  const subLinesBand = doc.splitTextToSize(subtitle, pageW - 60) as string[];
  doc.text(subLinesBand, centerX, titleY + 8, { align: 'center' });

  // ---- Localidade ----
  let y = BAND_H + 13;
  const municipio = meta.municipio ?? '';
  const estado = meta.estado ?? '';
  if (municipio || estado) {
    const loc = [municipio, estado].filter(Boolean).map((s) => s.toUpperCase()).join(' — ');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(loc, centerX, y, { align: 'center' });
    y += 7;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.textGray);
  doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
  y += 14;

  // ---- Título principal ----
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(title, centerX, y, { align: 'center' });
  y += 12;

  // ---- Subtítulo ----
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  const subLines = doc.splitTextToSize(subtitle, pageW - 60) as string[];
  doc.text(subLines, centerX, y, { align: 'center' });
  y += subLines.length * 8 + 18;

  // ---- Card de informações ----
  const cardLines: Array<{ label: string; value: string }> = [];
  if (coverOptions?.skillDetail) {
    if (meta.avaliacao?.trim()) {
      cardLines.push({ label: 'AVALIAÇÃO', value: meta.avaliacao.trim() });
    }
    if (meta.gabarito?.trim()) {
      cardLines.push({ label: 'GABARITO', value: meta.gabarito.trim() });
    }
    if (municipio) {
      cardLines.push({ label: 'MUNICÍPIO', value: municipio });
    }
    // Escopo: mostrar o que estiver selecionado (pode ser cumulativo)
    if (meta.escola?.trim()) cardLines.push({ label: 'ESCOLA', value: meta.escola.trim() });
    if (meta.serie?.trim()) cardLines.push({ label: 'SÉRIE', value: meta.serie.trim() });
    if (meta.turma?.trim()) cardLines.push({ label: 'TURMA', value: meta.turma.trim() });
    if (meta.shift?.trim()) cardLines.push({ label: 'TURNO', value: getClassShiftLabel(meta.shift) });
    const disc =
      meta.disciplina?.trim() || coverOptions.skillDisciplinaFallback?.trim();
    if (disc) {
      cardLines.push({ label: 'DISCIPLINA', value: disc });
    }
  } else {
    if (meta.avaliacao) cardLines.push({ label: 'AVALIAÇÃO', value: meta.avaliacao });
    if (meta.gabarito)  cardLines.push({ label: 'GABARITO',  value: meta.gabarito });
    // Quando escola específica selecionada mostra escola; caso contrário mostra município
    if (meta.escola) {
      cardLines.push({ label: 'ESCOLA', value: meta.escola });
    } else if (municipio) {
      cardLines.push({ label: 'MUNICÍPIO', value: municipio });
    }
    if (meta.serie)      cardLines.push({ label: 'SÉRIE',      value: meta.serie });
    if (meta.turma)      cardLines.push({ label: 'TURMA',      value: meta.turma });
    if (meta.shift?.trim()) cardLines.push({ label: 'TURNO', value: getClassShiftLabel(meta.shift) });
    if (meta.disciplina) cardLines.push({ label: 'DISCIPLINA', value: meta.disciplina });
  }
  cardLines.push(...extraCardLines);

  const cardW = pageW - 80;
  const cardX = (pageW - cardW) / 2;
  const rowH = 7;
  const cardInnerH = cardLines.length * rowH + 28;
  const cardH = Math.max(cardInnerH, 60);

  doc.setFillColor(...C.bgLight);
  doc.rect(cardX, y, cardW, cardH, 'F');
  // Acento lateral
  const ACCENT_W = 4;
  doc.setFillColor(...C.primary);
  doc.rect(cardX, y, ACCENT_W, cardH, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.4);
  doc.rect(cardX, y, cardW, cardH, 'S');

  let cy = y + 12;

  // Título do card
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  const cardContentCenterX = cardX + ACCENT_W + (cardW - ACCENT_W) / 2;
  doc.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cy, { align: 'center' });
  cy += 6;
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.line(cardX + ACCENT_W + 4, cy, cardX + cardW - 4, cy);
  cy += 9;

  const labelX = cardX + ACCENT_W + 12;
  const valueX = cardX + 68;
  const maxValueW = cardW - 70;

  doc.setFontSize(8.5);
  for (const { label, value } of cardLines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(`${label}:`, labelX, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const vLines = doc.splitTextToSize(value, maxValueW) as string[];
    doc.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 5);
  }
}

// ---------------------------------------------------------------------------
// Barra de legenda colorida
// ---------------------------------------------------------------------------

function drawLegendBar(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  // Gradiente contínuo por interpolação entre as faixas.
  const steps = 120;
  const stepW = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(steps - 1, 1);
    const pos = t * (LEGEND_STOPS.length - 1);
    const idx = Math.min(Math.floor(pos), LEGEND_STOPS.length - 2);
    const localT = pos - idx;
    const a = LEGEND_STOPS[idx];
    const b = LEGEND_STOPS[idx + 1];
    const r = Math.round(a[0] + (b[0] - a[0]) * localT);
    const g = Math.round(a[1] + (b[1] - a[1]) * localT);
    const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
    doc.setFillColor(r, g, bl);
    doc.rect(x + i * stepW, y, stepW + 0.2, h, 'F');
  }
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, 'S');
}

function _skillCardTitle(text: string, max = 12): string {
  const t = (text || '').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function drawSkillCardsByLevel(
  doc: jsPDF,
  map: SkillsMapResponse,
  x: number,
  y: number,
  totalW: number,
): number {
  const gap = 2;
  const colW = (totalW - gap * 3) / 4;
  const cardH = 6.8;
  const cardGapY = 1.2;
  const cardGapX = 1.2;
  const maxCardsVisible = 12;
  const cardsPerRow = 2;
  const colHeadH = 9;
  const emptyH = 14;

  let maxColH = 0;
  FAIXA_ORDER.forEach((faixa, idx) => {
    const cx = x + idx * (colW + gap);
    const fullList = map.por_faixa?.[faixa] ?? [];
    const list = fullList.slice(0, maxCardsVisible);
    const remaining = Math.max(0, fullList.length - list.length);
    const rows = Math.ceil(list.length / cardsPerRow);
    const cardW = (colW - 4 - cardGapX) / cardsPerRow;
    const listH =
      list.length > 0
        ? rows * cardH + Math.max(0, rows - 1) * cardGapY
        : emptyH;
    const overflowH = remaining > 0 ? 4.5 : 0;
    const innerH = listH + overflowH;
    const colH = colHeadH + innerH + 6;
    maxColH = Math.max(maxColH, colH);

    // Container da coluna
    doc.setFillColor(...C.bgLight);
    doc.rect(cx, y, colW, colH, 'F');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.25);
    doc.rect(cx, y, colW, colH, 'S');

    // Cabeçalho da coluna
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const [hr, hg, hb] = FAIXA_COLORS[faixa];
    doc.setTextColor(hr, hg, hb);
    doc.text(FAIXA_SHORT[faixa].toUpperCase(), cx + 2, y + 5);

    const pctLabel =
      faixa === 'abaixo_do_basico' ? '0-29%' :
      faixa === 'basico' ? '30-59%' :
      faixa === 'adequado' ? '60-79%' : '80-100%';
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textGray);
    doc.text(pctLabel, cx + 2, y + 8.5);

    const listY = y + colHeadH;
    if (list.length === 0) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...C.textGray);
      doc.text('Nenhuma habilidade', cx + 2, listY + 6);
      return;
    }

    list.forEach((h, i) => {
      const row = Math.floor(i / cardsPerRow);
      const col = i % cardsPerRow;
      const cardX = cx + 2 + col * (cardW + cardGapX);
      const cardY = listY + row * (cardH + cardGapY);
      const [r, g, b] = FAIXA_CARD_BG[faixa];
      doc.setFillColor(r, g, b);
      doc.roundedRect(cardX, cardY, cardW, cardH, 1.2, 1.2, 'F');

      doc.setTextColor(...FAIXA_CARD_TEXT[faixa]);
      doc.setFontSize(5.6);
      doc.setFont('helvetica', 'bold');
      doc.text(_skillCardTitle(h.codigo || h.descricao || '—', 9), cardX + 1.2, cardY + 2.6);
      doc.setFontSize(5.3);
      doc.setFont('helvetica', 'normal');
      doc.text(`${h.percentual_acertos.toFixed(1)}%`, cardX + 1.2, cardY + 5.4);
    });

    if (remaining > 0) {
      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.textGray);
      doc.text(`+${remaining} habilidades`, cx + colW - 2, y + colH - 2, { align: 'right' });
    }
  });

  return y + maxColH;
}

type IcoAsset = { dataUrl: string; iw: number; ih: number } | null;

// ---------------------------------------------------------------------------
// PDF GERAL
// ---------------------------------------------------------------------------

export async function downloadSkillsHeatMapGeneralPdf(opts: {
  modo: 'online' | 'cartao';
  map: SkillsMapResponse;
  filtrosTexto: string[];
  periodoLabel?: string;
  meta?: SkillsHeatMapPdfMeta;
  /** Só preenchido quando a análise IA foi gerada na interface (status ready). */
  analiseIa?: Record<string, unknown> | null;
}): Promise<void> {
  const { modo, map, periodoLabel, meta = {}, analiseIa = null } = opts;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxW = pageW - margin * 2;
  const contentBottom = pageH - 20;

  const modoLabel = modo === 'online' ? 'Avaliação Online' : 'Cartão-resposta';
  const subtitle = `RELATÓRIO GERAL — ${modoLabel.toUpperCase()}`;

  // --- Capa ---
  const extraLines: Array<{ label: string; value: string }> = [];
  if (periodoLabel) extraLines.push({ label: 'PERÍODO', value: periodoLabel });
  const nTurma = map.total_alunos_escopo_turma ?? map.total_alunos_participantes ?? map.total_alunos_escopo;
  const nPart  = map.total_alunos_participantes ?? map.total_alunos_escopo ?? 0;
  if (nTurma != null) extraLines.push({ label: 'ALUNOS NA TURMA', value: String(nTurma) });
  extraLines.push({ label: 'PARTICIPANTES', value: String(nPart) });

  await addCoverPage(doc, 'MAPA DE HABILIDADES', subtitle, meta, extraLines);

  // --- Página 2: guia de faixas + resumo ---
  doc.addPage();
  let y = addPageHeader(doc, 'Guia de Faixas e Resumo', meta.municipio, icoAsset);

  // Barra de legenda
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text('Guia visual das faixas de acerto', margin, y);
  y += 5;
  drawLegendBar(doc, margin, y, maxW, 7);
  y += 12;

  // Rótulos das faixas em linha
  const segW = maxW / FAIXA_ORDER.length;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  FAIXA_ORDER.forEach((f, i) => {
    const [r, g, b] = FAIXA_COLORS[f];
    doc.setTextColor(r, g, b);
    doc.text(FAIXA_LABELS[f], margin + i * segW, y, { maxWidth: segW - 1 });
  });
  doc.setTextColor(...C.textDark);
  y += 8;

  // Cards de público
  const cardW3 = (maxW - 8) / 3;
  const cards = [
    { label: 'Alunos na turma',  value: nTurma != null ? String(nTurma) : '—', color: C.textDark },
    { label: 'Participantes',    value: String(nPart),                          color: C.primary },
    { label: '% de participação', value: nTurma && nTurma > 0 ? `${((nPart / nTurma) * 100).toFixed(1)}%` : '—', color: C.green },
  ];
  cards.forEach((card, i) => {
    const cx = margin + i * (cardW3 + 4);
    doc.setFillColor(...C.bgLight);
    doc.rect(cx, y, cardW3, 22, 'F');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.4);
    doc.rect(cx, y, cardW3, 22, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textGray);
    doc.text(card.label.toUpperCase(), cx + 5, y + 7);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...card.color);
    doc.text(card.value, cx + 5, y + 17);
  });
  y += 30;

  // Cards das habilidades por nível (estilo visual do mapa)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text('Habilidades por nível de acerto', margin, y);
  y += 4;
  y = drawSkillCardsByLevel(doc, map, margin, y, maxW);
  y += 8;

  // Tabela de resumo por faixa
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text('Distribuição das habilidades por faixa', margin, y);
  y += 5;

  const autoTable = (await import('jspdf-autotable')).default;

  const resumoRows = FAIXA_ORDER.map((f) => {
    const list = map.por_faixa?.[f] ?? [];
    const totalHabs = Object.values(map.por_faixa ?? {}).reduce((s, l) => s + l.length, 0);
    const pct = totalHabs > 0 ? ((list.length / totalHabs) * 100).toFixed(1) : '0.0';
    return [FAIXA_LABELS[f], String(list.length), `${pct}%`];
  });

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Faixa', 'Qtd. habilidades', '% do total']],
    body: resumoRows,
    margin: { left: margin, right: margin },
    tableLineColor: C.borderLight,
    tableLineWidth: 0.2,
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: C.textDark,
      valign: 'middle',
      lineColor: C.borderLight,
      lineWidth: 0.1,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 90, halign: 'left' },
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 0) {
        const faixa = FAIXA_ORDER[data.row.index];
        if (faixa) {
          const [r, g, b] = FAIXA_COLORS[faixa];
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const groupedByDisc = collectSkillsGroupedByDiscipline(map);
  const discNamesOrdered = sortedDisciplineNames(groupedByDisc);
  const totalHabsAll = discNamesOrdered.reduce((s, n) => s + (groupedByDisc.get(n)?.length ?? 0), 0);

  let afterFaixaY = (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y;
  afterFaixaY += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text('Distribuição das habilidades por disciplina', margin, afterFaixaY);
  afterFaixaY += 5;

  const resumoDiscRows = discNamesOrdered.map((name) => {
    const n = groupedByDisc.get(name)?.length ?? 0;
    const pct = totalHabsAll > 0 ? ((n / totalHabsAll) * 100).toFixed(1) : '0.0';
    return [name, String(n), `${pct}%`];
  });

  autoTable(doc, {
    startY: afterFaixaY,
    theme: 'grid',
    head: [['Disciplina', 'Qtd. habilidades', '% do total']],
    body: resumoDiscRows.length > 0 ? resumoDiscRows : [['—', '0', '0%']],
    margin: { left: margin, right: margin },
    tableLineColor: C.borderLight,
    tableLineWidth: 0.2,
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: C.textDark,
      valign: 'middle',
      lineColor: C.borderLight,
      lineWidth: 0.1,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 90, halign: 'left' },
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
    },
  });

  // --- Páginas seguintes: habilidades agrupadas por disciplina ---
  for (const discName of discNamesOrdered) {
    const list = groupedByDisc.get(discName) ?? [];
    if (list.length === 0) continue;

    doc.addPage();
    let fy = addPageHeader(doc, `Habilidades — ${discName}`, meta.municipio, icoAsset);

    doc.setFillColor(...C.primary);
    doc.rect(margin, fy - 1, maxW, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    const discBarText =
      discName.length > 75 ? `${discName.slice(0, 72)}…` : discName;
    doc.text(discBarText.toUpperCase(), margin + 4, fy + 4);
    fy += 10;

    const rows = list.map((h) => [
      h.codigo || '—',
      h.descricao || '—',
      FAIXA_SHORT[h.faixa],
      `${h.percentual_acertos.toFixed(1)}%`,
    ]);

    autoTable(doc, {
      startY: fy,
      theme: 'grid',
      head: [['Código', 'Descrição', 'Faixa de acerto', '% Acertos']],
      body: rows,
      margin: { left: margin, right: margin },
      tableLineColor: C.borderLight,
      tableLineWidth: 0.2,
      headStyles: {
        fillColor: C.primary,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      bodyStyles: {
        fontSize: 7.8,
        textColor: C.textDark,
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: C.borderLight,
        lineWidth: 0.1,
        cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 30, halign: 'left' },
        1: { cellWidth: 80, halign: 'left' },
        2: { cellWidth: 38, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
      },
      pageBreak: 'auto',
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 2) {
          const h = list[data.row.index];
          if (h) {
            const [r, g, b] = FAIXA_COLORS[h.faixa];
            data.cell.styles.textColor = [r, g, b];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: () => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...C.textGray);
        const cont = discName.length > 40 ? `${discName.slice(0, 37)}…` : discName;
        doc.text(`continuação — ${cont}`, pageW - margin, contentBottom + 2, { align: 'right' });
      },
    });
  }

  if (analiseIa && typeof analiseIa === 'object' && !Array.isArray(analiseIa)) {
    const segments = buildStructuredIaSegmentsFromRoot(analiseIa, null);
    if (hasAnyStructuredIaContent(segments)) {
      doc.addPage();
      const pageH = doc.internal.pageSize.getHeight();
      const marginAnnex = 15;
      const maxWAnnex = doc.internal.pageSize.getWidth() - 2 * marginAnnex;
      let yAnnex = addPageHeader(doc, 'Análise com IA', meta.municipio, icoAsset);
      const bumpIaPage = (): number => {
        doc.addPage();
        return addPageHeader(doc, 'Análise com IA (continuação)', meta.municipio, icoAsset);
      };
      await renderStructuredIaPdfContent(
        {
          doc,
          margin: marginAnnex,
          maxW: maxWAnnex,
          contentBottom: pageH - 20,
          palette: C,
          bumpPage: bumpIaPage,
        },
        yAnnex,
        {
          sectionTitle: 'Análise com IA',
          showSectionHeading: false,
          footnote:
            'Conteúdo gerado automaticamente a partir dos filtros e do recorte exibido.',
          segments,
        },
      );
    }
  }

  addFooters(doc);
  doc.save(`mapa-habilidades-geral-${modo}.pdf`);
}

// ---------------------------------------------------------------------------
// PDF POR HABILIDADE
// ---------------------------------------------------------------------------

export async function downloadSkillsHeatMapSkillPdf(opts: {
  modo: 'online' | 'cartao';
  skill: SkillsMapHabilidade;
  erros: SkillsMapErrosResponse;
  filtrosTexto: string[];
  periodoLabel?: string;
  meta?: SkillsHeatMapPdfMeta;
  analiseIa?: Record<string, unknown> | null;
}): Promise<void> {
  const { modo, skill, erros, meta = {}, analiseIa = null } = opts;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxW = pageW - margin * 2;

  const codigoDisplay = skill.codigo?.trim() || 'Habilidade';
  const modoLabel = modo === 'online' ? 'Avaliação Online' : 'Cartão-resposta';

  // --- Capa ---
  const tot  = erros.total_alunos_escopo;
  const nErr = erros.total_alunos_que_erraram;
  const nOk  = erros.total_alunos_que_acertaram ?? Math.max(0, tot - nErr);
  const pa   = erros.percentual_acertos ?? (tot > 0 ? (nOk / tot) * 100 : 0);
  const pe   = erros.percentual_erros;

  await addCoverPage(
    doc,
    'MAPA DE HABILIDADES',
    `DETALHE DA HABILIDADE — ${modoLabel.toUpperCase()}`,
    meta,
    [],
    {
      skillDetail: true,
      skillDisciplinaFallback: skill.disciplina_nome,
    },
  );

  // --- Página 2: métricas + tabelas ---
  doc.addPage();
  let y = addPageHeader(doc, `Habilidade ${codigoDisplay}`, meta.municipio, icoAsset);

  // Bloco de descrição da habilidade
  if (skill.descricao?.trim()) {
    doc.setFillColor(...C.bgLight);
    const descLines = doc.splitTextToSize(skill.descricao.trim(), maxW - 10) as string[];
    const blockH = descLines.length * 5 + 10;
    doc.rect(margin, y, maxW, blockH, 'F');
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin, y + blockH);
    doc.setLineWidth(0.3);
    doc.setDrawColor(...C.borderLight);
    doc.line(margin + 3, y, margin + maxW, y);
    doc.line(margin + 3, y + blockH, margin + maxW, y + blockH);
    doc.line(margin + maxW, y, margin + maxW, y + blockH);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    doc.text(descLines, margin + 6, y + 6);
    y += blockH + 5;
  }

  if (skill.disciplina_nome) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...C.textGray);
    doc.text(`Disciplina: ${skill.disciplina_nome}`, margin, y);
    y += 7;
  }

  // 3 cards de métricas
  const cardW3 = (maxW - 8) / 3;
  const metricCards = [
    { label: 'Participantes',  value: String(tot),               color: C.textDark },
    { label: 'Acertaram',      value: `${nOk} (${pa.toFixed(1)}%)`, color: C.green  },
    { label: 'Erraram',        value: `${nErr} (${pe.toFixed(1)}%)`, color: C.red    },
  ];
  metricCards.forEach((card, i) => {
    const cx = margin + i * (cardW3 + 4);
    const isAccent = i > 0;
    const bg: [number, number, number] = i === 1
      ? [236, 253, 245]
      : i === 2
        ? [254, 242, 242]
        : C.bgLight;
    doc.setFillColor(...bg);
    doc.rect(cx, y, cardW3, 25, 'F');
    doc.setDrawColor(...card.color);
    doc.setLineWidth(isAccent ? 0.8 : 0.4);
    doc.rect(cx, y, cardW3, 25, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    doc.text(card.label.toUpperCase(), cx + 5, y + 8);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...card.color);
    doc.text(card.value, cx + 5, y + 20);
  });
  y += 32;

  // Separador roxo
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Nota de rodapé metodológico
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...C.textGray);
  doc.text(
    'Listas e percentuais consideram apenas participantes (com prova ou cartão válido), excluindo faltosos.',
    margin, y,
  );
  y += 8;

  const autoTable = (await import('jspdf-autotable')).default;

  const buildStudentRows = (list: SkillsMapAlunoLinha[]) =>
    list.map((a) => [
      a.nome || '—',
      a.escola || '—',
      a.serie || '—',
      a.turma || '—',
      getClassShiftLabel(a.shift),
    ]);

  const okList  = erros.alunos_que_acertaram ?? [];
  const errList = erros.alunos_que_erraram ?? erros.alunos ?? [];

  // Tabela de acertos
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.green);
  doc.text(`Alunos que acertaram todos os itens da habilidade (${okList.length})`, margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Nome', 'Escola', 'Série', 'Turma', 'Turno']],
    body: okList.length > 0 ? buildStudentRows(okList) : [['Nenhum participante nesta situação', '', '', '', '']],
    margin: { left: margin, right: margin },
    tableLineColor: C.borderLight,
    tableLineWidth: 0.2,
    headStyles: {
      fillColor: C.green,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.textDark,
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: C.borderLight,
      lineWidth: 0.1,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    alternateRowStyles: { fillColor: [236, 253, 245] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 63, halign: 'left' },
      1: { cellWidth: 57, halign: 'left' },
      2: { cellWidth: 27, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
    },
    pageBreak: 'auto',
  });

  // Tabela de erros
  const afterOk = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let ye = afterOk + 8;

  if (ye > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    ye = addPageHeader(doc, `Habilidade ${codigoDisplay} (cont.)`, meta.municipio, icoAsset);
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.red);
  doc.text(`Alunos que erraram ao menos um item da habilidade (${errList.length})`, margin, ye);
  ye += 4;

  autoTable(doc, {
    startY: ye,
    theme: 'grid',
    head: [['Nome', 'Escola', 'Série', 'Turma', 'Turno']],
    body: errList.length > 0 ? buildStudentRows(errList) : [['Nenhum participante nesta situação', '', '', '', '']],
    margin: { left: margin, right: margin },
    tableLineColor: C.borderLight,
    tableLineWidth: 0.2,
    headStyles: {
      fillColor: C.red,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.textDark,
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: C.borderLight,
      lineWidth: 0.1,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
    },
    alternateRowStyles: { fillColor: [254, 242, 242] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 63, halign: 'left' },
      1: { cellWidth: 57, halign: 'left' },
      2: { cellWidth: 27, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
    },
    pageBreak: 'auto',
  });

  if (analiseIa && typeof analiseIa === 'object' && !Array.isArray(analiseIa)) {
    const prefer = skill.disciplina_nome?.trim() || null;
    let segments = buildStructuredIaSegmentsFromRoot(analiseIa, prefer);
    if (!hasAnyStructuredIaContent(segments)) {
      segments = buildStructuredIaSegmentsFromRoot(analiseIa, null);
    }
    if (hasAnyStructuredIaContent(segments)) {
      doc.addPage();
      const pageHSkill = doc.internal.pageSize.getHeight();
      const marginIa = 15;
      const maxWIa = doc.internal.pageSize.getWidth() - 2 * marginIa;
      let yIa = addPageHeader(doc, 'Análise com IA', meta.municipio, icoAsset);
      const bumpIaSkill = (): number => {
        doc.addPage();
        return addPageHeader(doc, 'Análise com IA (continuação)', meta.municipio, icoAsset);
      };
      await renderStructuredIaPdfContent(
        {
          doc,
          margin: marginIa,
          maxW: maxWIa,
          contentBottom: pageHSkill - 20,
          palette: C,
          bumpPage: bumpIaSkill,
        },
        yIa,
        {
          sectionTitle: 'Análise com IA',
          showSectionHeading: false,
          footnote:
            'Conteúdo gerado automaticamente a partir dos filtros e do recorte exibido.',
          segments,
        },
      );
    }
  }

  addFooters(doc);
  const safeCode = codigoDisplay.replace(/[^\w-]+/g, '_').slice(0, 40);
  doc.save(`mapa-habilidades-${modo}-${safeCode}.pdf`);
}
