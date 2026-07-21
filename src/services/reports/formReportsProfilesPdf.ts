import {
  loadCityBrandingPdfAssets,
  paintLetterheadBackground,
  urlToPngAsset,
} from '@/utils/pdfCityBranding';
import {
  buildQuestionNumberMap,
  getOrderedProfileKeys,
  parseQuestionNumberFromId,
  type ProfileQuestion,
} from '@/components/reports/form-reports/FormReportProfileCharts';

const CHART_PALETTE: Array<{ color: [number, number, number]; textOnBar: [number, number, number] }> = [
  { color: [75, 33, 142], textOnBar: [255, 255, 255] },
  { color: [59, 130, 246], textOnBar: [255, 255, 255] },
  { color: [221, 214, 254], textOnBar: [31, 41, 55] },
  { color: [124, 58, 237], textOnBar: [255, 255, 255] },
];

const BAR_FILL: [number, number, number] = [59, 130, 246];
const BAR_TRACK: [number, number, number] = [232, 236, 244];
const PROFILE_BANNER: [number, number, number] = [224, 231, 255];
const PROFILE_TITLE: [number, number, number] = [75, 33, 142];
const LONG_LABEL_THRESHOLD = 40;

export type FormReportsPdfProfile = {
  nome?: string;
  questoes?: string[];
  dados?: Record<string, ProfileQuestion>;
};

export type FormReportsPdfInput = {
  perfis: Record<string, FormReportsPdfProfile>;
  profileTitles: Record<string, string>;
  municipalityId?: string;
  municipalityName?: string;
  schoolNames?: string;
  formTitle?: string;
  gradeNames?: string;
  classNames?: string;
  totalRespostas?: number;
  indicesSummary?: Array<{ title: string; total: number; porcentagem: number }>;
};

function getPercentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function getOptionSortIndex(label: string): number {
  const normalized = label.toLowerCase().trim();

  if (/discordo\s+totalmente|totalmente\s+discordo/.test(normalized)) return 3;
  if (/\bdiscordo\b/.test(normalized)) return 2;
  if (/concordo\s+totalmente|totalmente\s+concordo/.test(normalized)) return 1;
  if (/\bconcordo\b/.test(normalized)) return 0;

  if (/nunca|nenhum/.test(normalized)) return 0;
  if (/vez em quando|às vezes|as vezes|maioria/.test(normalized)) return 1;
  if (/sempre|todos/.test(normalized)) return 2;
  return 99;
}

function getPaletteStyle(index: number) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

function getSubquestionOptionStyle(label: string, index: number) {
  const sortIndex = getOptionSortIndex(label);
  return getPaletteStyle(sortIndex < 99 ? sortIndex : index);
}

function sortSubquestionOptions(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const orderA = getOptionSortIndex(a);
    const orderB = getOptionSortIndex(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, 'pt-BR');
  });
}

function collectSubquestionOptionLabels(
  subperguntas: Record<string, { texto: string; contagem: Record<string, number> }>
): string[] {
  const labels = new Set<string>();
  Object.values(subperguntas).forEach((sub) => {
    Object.keys(sub.contagem ?? {}).forEach((label) => labels.add(label));
  });
  return sortSubquestionOptions(Array.from(labels));
}

function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

export async function generateFormReportsProfilesPdf(input: FormReportsPdfInput): Promise<void> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = (jsPDFModule as any).default || jsPDFModule;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  const bottomLimit = pageHeight - margin;

  const primaryRgb: [number, number, number] = [124, 58, 237];
  const textDark: [number, number, number] = [31, 41, 55];
  const textMuted: [number, number, number] = [107, 114, 128];

  const branding =
    input.municipalityId && input.municipalityId !== 'all'
      ? await loadCityBrandingPdfAssets(input.municipalityId)
      : { letterhead: null, logo: null };

  if (branding.letterhead) {
    paintLetterheadBackground(doc, branding.letterhead, pageWidth, pageHeight);
  }
  const hasLetterhead = Boolean(branding.letterhead);
  const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
  const logoAsset = branding.logo ?? (await urlToPngAsset('/LOGO-1.png'));

  const drawCover = () => {
    const BAND_H = 58;
    if (!hasLetterhead) {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, BAND_H, 'F');
    }

    let logoBottom = 0;
    if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
      const desiredLogoWidth = 38;
      const desiredLogoHeight = (logoAsset.ih * desiredLogoWidth) / logoAsset.iw;
      const logoY = hasLetterhead ? 18 : 7;
      doc.addImage(
        logoAsset.dataUrl,
        'PNG',
        centerX - desiredLogoWidth / 2,
        logoY,
        desiredLogoWidth,
        desiredLogoHeight
      );
      logoBottom = logoY + desiredLogoHeight;
    } else {
      doc.setFontSize(18);
      doc.setTextColor(...(hasLetterhead ? primaryRgb : ([255, 255, 255] as [number, number, number])));
      doc.setFont('helvetica', 'bold');
      doc.text('AFIRME PLAY', centerX, hasLetterhead ? 30 : 22, { align: 'center' });
      logoBottom = hasLetterhead ? 36 : 28;
    }

    const titleY = hasLetterhead ? logoBottom + 10 : Math.max(logoBottom + 5, BAND_H - 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...(hasLetterhead ? primaryRgb : ([255, 255, 255] as [number, number, number])));
    doc.text('DASHBOARD — FORMULÁRIOS', centerX, titleY, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(...(hasLetterhead ? textDark : ([255, 255, 255] as [number, number, number])));
    doc.text('QUESTIONÁRIO SOCIOECONÔMICO', centerX, titleY + 8, { align: 'center' });

    let coverY = hasLetterhead ? titleY + 14 : BAND_H + 13;
    if (input.municipalityName) {
      doc.setFontSize(14);
      doc.setTextColor(...primaryRgb);
      doc.setFont('helvetica', 'bold');
      doc.text(input.municipalityName.toUpperCase(), centerX, coverY, { align: 'center' });
      coverY += 8;
    }
    doc.setFontSize(11);
    doc.setTextColor(...textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, coverY, { align: 'center' });
    coverY += 14;

    const cardWidth = pageWidth - 80;
    const cardX = (pageWidth - cardWidth) / 2;
    const cardHeight = 98;
    const ACCENT_W = 4;
    doc.setFillColor(250, 250, 250);
    doc.rect(cardX, coverY, cardWidth, cardHeight, 'F');
    doc.setFillColor(...primaryRgb);
    doc.rect(cardX, coverY, ACCENT_W, cardHeight, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.rect(cardX, coverY, cardWidth, cardHeight, 'S');

    let cardY = coverY + 12;
    const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...primaryRgb);
    doc.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cardY, { align: 'center' });
    cardY += 6;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
    cardY += 8;

    const rows: Array<{ label: string; value: string }> = [
      { label: 'MUNICÍPIO:', value: input.municipalityName || 'N/A' },
      { label: 'ESCOLA(S):', value: input.schoolNames || '—' },
      { label: 'FORMULÁRIO:', value: input.formTitle || 'N/A' },
      { label: 'SÉRIE(S):', value: input.gradeNames || '—' },
      { label: 'TURMA(S):', value: input.classNames || '—' },
      {
        label: 'TOTAL RESPOSTAS:',
        value: input.totalRespostas != null ? formatCount(input.totalRespostas) : '—',
      },
    ];
    const leftColX = cardX + ACCENT_W + 15;
    const labelWidth = 54;
    const valueMaxWidth = cardWidth - labelWidth - 30;
    doc.setFontSize(9);
    for (const row of rows) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryRgb);
      doc.text(row.label, leftColX, cardY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textDark);
      const lines = doc.splitTextToSize(row.value, valueMaxWidth);
      doc.text(lines, leftColX + labelWidth, cardY);
      cardY += Math.max(7, lines.length * 5);
    }
  };

  const drawInternalHeader = (title: string): number => {
    const BAND_H = 20;
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, pageWidth, BAND_H, 'F');
    if (icoAsset?.dataUrl && icoAsset.iw > 0 && icoAsset.ih > 0) {
      const icoH = 14;
      const icoW = (icoAsset.iw * icoH) / icoAsset.ih;
      doc.addImage(icoAsset.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
    } else {
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });
    return BAND_H + 10;
  };

  let y = 0;

  const ensureSpace = (heightNeeded: number) => {
    if (y + heightNeeded > bottomLimit) {
      doc.addPage();
      y = drawInternalHeader('DASHBOARD — FORMULÁRIOS');
    }
  };

  const drawRoundedRect = (
    x: number,
    ry: number,
    w: number,
    h: number,
    r: number,
    fill: [number, number, number]
  ) => {
    doc.setFillColor(...fill);
    const radius = Math.min(r, h / 2, w / 2);
    doc.roundedRect(x, ry, w, h, radius, radius, 'F');
  };

  const drawHorizontalBars = (contagem: Record<string, number>, totalRespostas: number) => {
    const entries = Object.entries(contagem ?? {});
    if (entries.length === 0) {
      ensureSpace(8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...textMuted);
      doc.text('Nenhuma resposta registrada.', margin, y);
      y += 8;
      return;
    }

    const barH = 7;
    const gap = 4;

    for (const [label, count] of entries) {
      const pct = getPercentage(Number(count), totalRespostas);
      const isLongLabel = label.length > LONG_LABEL_THRESHOLD;
      const fillPct = pct > 0 ? Math.max(pct, isLongLabel ? 10 : 15) : 0;

      if (isLongLabel) {
        const labelLines = doc.splitTextToSize(label, contentWidth);
        ensureSpace(labelLines.length * 4 + barH + gap + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(labelLines, margin, y);
        y += labelLines.length * 4 + 1;

        drawRoundedRect(margin, y, contentWidth, barH, 3.5, BAR_TRACK);
        if (fillPct > 0) {
          const fillW = (contentWidth * fillPct) / 100;
          drawRoundedRect(margin, y, fillW, barH, 3.5, BAR_FILL);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(`${pct}%`, margin + 2.5, y + barH / 2 + 1);
        }
        y += barH + gap;
      } else {
        ensureSpace(barH + gap + 2);
        const pctColW = 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(`${pct}%`, margin + pctColW - 1, y + barH / 2 + 1, { align: 'right' });

        const barX = margin + pctColW + 2;
        const barW = contentWidth - pctColW - 2;
        drawRoundedRect(barX, y, barW, barH, 3.5, BAR_TRACK);
        if (fillPct > 0) {
          const fillW = Math.max((barW * fillPct) / 100, 18);
          drawRoundedRect(barX, y, Math.min(fillW, barW), barH, 3.5, BAR_FILL);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          const truncated = doc.splitTextToSize(label, Math.min(fillW, barW) - 4)[0] || label;
          doc.text(truncated, barX + 2.5, y + barH / 2 + 1);
        }
        y += barH + gap;
      }
    }
  };

  const drawStackedSubQuestions = (
    subperguntas: Record<string, { texto: string; contagem: Record<string, number> }>
  ) => {
    const legendLabels = collectSubquestionOptionLabels(subperguntas);
    const barH = 8;

    if (legendLabels.length > 0) {
      ensureSpace(10);
      let legendX = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      for (let i = 0; i < legendLabels.length; i++) {
        const label = legendLabels[i];
        const style = getSubquestionOptionStyle(label, i);
        const itemW = doc.getTextWidth(label) + 8;
        if (legendX + itemW > pageWidth - margin) {
          y += 6;
          legendX = margin;
          ensureSpace(8);
        }
        doc.setFillColor(...style.color);
        doc.circle(legendX + 1.5, y - 1, 1.5, 'F');
        doc.setTextColor(...textDark);
        doc.text(label, legendX + 5, y);
        legendX += itemW + 4;
      }
      y += 6;
    }

    for (const [, subData] of Object.entries(subperguntas)) {
      const subContagem = subData?.contagem ?? {};
      const subTotal = Object.values(subContagem).reduce((sum, value) => sum + Number(value), 0);
      const labelLines = doc.splitTextToSize(subData.texto || '', contentWidth);
      const radius = Math.min(4, barH / 2);

      const segments = legendLabels
        .map((label, index) => {
          const count = Number(subContagem[label] ?? 0);
          const pct = getPercentage(count, subTotal);
          if (pct <= 0) return null;
          return {
            label,
            pct,
            segW: (contentWidth * pct) / 100,
            ...getSubquestionOptionStyle(label, index),
          };
        })
        .filter(Boolean) as Array<{
        label: string;
        pct: number;
        segW: number;
        color: [number, number, number];
        textOnBar: [number, number, number];
      }>;

      ensureSpace(labelLines.length * 4 + barH + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 4 + 1;

      if (subTotal === 0 || segments.length === 0) {
        drawRoundedRect(margin, y, contentWidth, barH, radius, BAR_TRACK);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...textMuted);
        doc.text('Sem respostas', margin + 2.5, y + barH / 2 + 1);
        y += barH + 5;
        continue;
      }

      // Uma única opção a 100%: barra inteira arredondada (evita cantos retos do rect)
      if (segments.length === 1) {
        const only = segments[0];
        drawRoundedRect(margin, y, contentWidth, barH, radius, only.color);
        if (only.pct >= 6) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...only.textOnBar);
          doc.text(`${only.pct}%`, margin + contentWidth / 2, y + barH / 2 + 1, {
            align: 'center',
          });
        }
        y += barH + 5;
        continue;
      }

      // Vários segmentos: clip na forma arredondada para manter cantos redondos
      drawRoundedRect(margin, y, contentWidth, barH, radius, BAR_TRACK);
      doc.saveGraphicsState();
      doc.roundedRect(margin, y, contentWidth, barH, radius, radius, null);
      doc.clip();
      doc.discardPath();

      let segX = margin;
      for (const segment of segments) {
        doc.setFillColor(...segment.color);
        doc.rect(segX, y, segment.segW, barH, 'F');
        if (segment.pct >= 6) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...segment.textOnBar);
          doc.text(`${segment.pct}%`, segX + segment.segW / 2, y + barH / 2 + 1, {
            align: 'center',
          });
        }
        segX += segment.segW;
      }

      doc.restoreGraphicsState();
      y += barH + 5;
    }
  };

  const drawQuestion = (
    questionNumber: number,
    questionId: string,
    questionData: ProfileQuestion
  ) => {
    const title = `${questionNumber} - ${questionData.textoPergunta ?? questionId}`;
    const titleLines = doc.splitTextToSize(title, contentWidth);
    const hasSub =
      questionData.subperguntas && Object.keys(questionData.subperguntas).length > 0;
    const estimated =
      titleLines.length * 5 +
      8 +
      (hasSub ? 40 : Object.keys(questionData.contagem ?? {}).length * 12);

    ensureSpace(Math.min(estimated, 40));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...textDark);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5 + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text(
      `Total de respondentes: ${formatCount(questionData.totalRespostas ?? 0)}`,
      margin,
      y
    );
    y += 6;

    if (hasSub) {
      drawStackedSubQuestions(questionData.subperguntas!);
    } else {
      drawHorizontalBars(questionData.contagem ?? {}, questionData.totalRespostas ?? 0);
    }

    y += 4;
  };

  // Capa
  drawCover();
  doc.addPage();
  y = drawInternalHeader('DASHBOARD — FORMULÁRIOS');

  // Sumário executivo (se houver)
  if (input.indicesSummary && input.indicesSummary.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...primaryRgb);
    doc.text('Sumário Executivo', margin, y);
    y += 7;

    for (const item of input.indicesSummary) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(item.title, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMuted);
      doc.text(
        `${item.total} alunos (${item.porcentagem.toFixed(1)}%)`,
        pageWidth - margin,
        y,
        { align: 'right' }
      );
      y += 6;
    }
    y += 6;
  }

  const questionNumberById = buildQuestionNumberMap(input.perfis);
  const orderedKeys = getOrderedProfileKeys(input.perfis);

  for (const profileKey of orderedKeys) {
    const profile = input.perfis[profileKey];
    if (!profile) continue;

    const profileTitle =
      input.profileTitles[profileKey] || profile.nome || profileKey;

    ensureSpace(18);
    drawRoundedRect(margin, y - 4, contentWidth, 10, 2, PROFILE_BANNER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PROFILE_TITLE);
    doc.text(profileTitle, margin + 3, y + 2.5);
    y += 12;

    const questionIds =
      profile.questoes?.length > 0
        ? profile.questoes
        : Object.keys(profile.dados ?? {});

    questionIds.forEach((questionId, index) => {
      const questionData = profile.dados?.[questionId];
      if (!questionData) return;
      const questionNumber =
        questionNumberById[questionId] ??
        parseQuestionNumberFromId(questionId) ??
        index + 1;
      drawQuestion(questionNumber, questionId, questionData);
    });

    y += 4;
  }

  const safeTitle = (input.formTitle || 'dashboard_formularios').replace(/[\\/:*?"<>|]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Dashboard_formularios_${safeTitle}_${dateStr}.pdf`);
}
