import type { ProcessedEvolutionData } from '@/components/evolution/EvolutionCharts';
import type { ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionPDFLayout } from '@/components/evolution/EvolutionPDFLayout';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadCityBrandingForReportPdf, type PdfImageAsset, urlToPngAsset } from '@/utils/pdfCityBranding';
import {
  formatEvaluationClassNames,
  formatEvaluationGradeNames,
  sortEvaluationsByOrder,
} from '@/utils/evolution/evaluationScopeLabels';

interface FilterInfo {
  state?: { id: string; name: string };
  municipality?: { id: string; name: string };
  school?: { id: string; name: string }; // Escola única (para compatibilidade)
  schools?: Array<{ id?: string; name: string }>; // Múltiplas escolas
  grade?: { id: string; name: string };
  class?: { id: string; name: string };
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Captura uma seção individual do HTML como canvas
 * Otimizado para performance
 */
async function captureSection(
  element: HTMLElement,
  html2canvas: any,
  scale: number = 2.0
): Promise<HTMLCanvasElement> {
  return await html2canvas(element, {
    scale, // Aumentado para melhor qualidade (2.0 é um bom equilíbrio)
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    removeContainer: true, // Remove container temporário após captura
    imageTimeout: 0, // Não esperar por imagens externas
    letterRendering: true, // Melhora a renderização de texto
    // foreignObjectRendering pode causar problemas com SVGs, removido temporariamente
    ignoreElements: (el) => {
      // Ignorar elementos que não são visíveis
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
      
      // Ignorar elementos de formulário que não são necessários para o PDF
      const tagName = el.tagName?.toLowerCase();
      const formElements = ['input', 'textarea', 'select', 'button', 'form'];
      if (formElements.includes(tagName)) {
        return true;
      }
      
      // Ignorar labels não associados (que causam os warnings)
      if (tagName === 'label') {
        const forAttr = (el as HTMLLabelElement).htmlFor;
        const hasInput = el.querySelector('input, textarea, select');
        if (!forAttr && !hasInput) {
          return true;
        }
      }
      
      // Ignorar elementos com role de formulário que não são visíveis no PDF
      const role = el.getAttribute('role');
      if (role === 'textbox' || role === 'combobox' || role === 'button') {
        return true;
      }
      
      return false;
    },
  });
}

/**
 * Adiciona uma seção ao PDF, criando nova página se necessário
 * Retorna a nova posição Y após adicionar a seção
 */
function addSectionToPDF(
  pdf: any,
  canvas: HTMLCanvasElement,
  currentY: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  imgWidth: number
): number {
  const usableHeight = pageHeight - marginTop - marginBottom;
  const usableWidth = imgWidth - marginLeft - marginRight;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;
  
  // Tentar usar PNG primeiro, mas fazer fallback para JPEG se necessário
  let imgData: string;
  let imageFormat: string;
  try {
    // PNG para melhor qualidade de texto e gráficos
    imgData = canvas.toDataURL('image/png');
    imageFormat = 'PNG';
  } catch (error) {
    // Fallback para JPEG com alta qualidade se PNG falhar
    console.warn('Erro ao gerar PNG, usando JPEG:', error);
    imgData = canvas.toDataURL('image/jpeg', 0.95);
    imageFormat = 'JPEG';
  }
  
  // Se a seção não cabe na página atual, criar nova página
  // Isso garante que cada seção completa (gráfico) fique em uma única página
  if (currentY + imgHeight > pageHeight - marginBottom) {
    pdf.addPage();
    currentY = marginTop;
  }
  
  // Adicionar a seção na posição atual com margens laterais
  pdf.addImage(imgData, imageFormat, marginLeft, currentY, usableWidth, imgHeight);
  
  // Retornar nova posição Y (com pequeno espaçamento entre seções)
  return currentY + imgHeight + 5; // 5mm de espaçamento entre seções
}

// Paleta de cores institucional (baseada em AcertoNiveis.tsx e institutional_test_hybrid.html)
const COLORS = {
  primary: [124, 62, 237] as [number, number, number],      // #7c3aed - roxo principal
  textDark: [31, 41, 55] as [number, number, number],        // #1f2937 - preto texto
  textGray: [107, 114, 128] as [number, number, number],     // #6b7280 - cinza texto
  borderLight: [229, 231, 235] as [number, number, number],  // #e5e7eb - cinza borda
  bgLight: [250, 250, 250] as [number, number, number],      // #fafafa - fundo claro
  white: [255, 255, 255] as [number, number, number]         // branco
};

/**
 * Adiciona página de informações sobre filtros e avaliações selecionadas
 */
function addFiltersInfoPage(
  pdf: any,
  pageWidth: number,
  pageHeight: number,
  filterInfo: FilterInfo | null,
  evaluationNames: string[],
  processedData: ProcessedEvolutionData | null,
  ico?: { dataUrl: string; iw: number; ih: number } | null,
  instrumentLabel = 'avaliações'
): void {
  pdf.setFillColor(...COLORS.white);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  const margin = 15;
  const centerX = pageWidth / 2;
  const BAND_H = 20;

  // Cabeçalho compacto
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(0, 0, pageWidth, BAND_H, 'F');
  if (ico?.dataUrl && ico.iw > 0 && ico.ih > 0) {
    const icoH = 14;
    const icoW = (ico.iw * icoH) / ico.ih;
    pdf.addImage(ico.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
  } else {
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORS.white);
  pdf.text('INFORMAÇÕES DO RELATÓRIO', pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });

  let currentY = BAND_H + 10;

  // Card de filtros
  const cardW = pageWidth - margin * 2;
  const cardX = margin;
  const ACCENT_W = 4;
  const rowH = 6;
  const filterLines: Array<{ label: string; value: string }> = [];

  if (filterInfo?.state?.name) filterLines.push({ label: 'ESTADO', value: filterInfo.state.name });
  if (filterInfo?.municipality?.name) filterLines.push({ label: 'MUNICÍPIO', value: filterInfo.municipality.name });
  const schoolsToDisplay = filterInfo?.schools && filterInfo.schools.length > 0
    ? filterInfo.schools
    : filterInfo?.school
      ? [filterInfo.school]
      : [];
  if (schoolsToDisplay.length === 1) filterLines.push({ label: 'ESCOLA', value: schoolsToDisplay[0].name });
  if (schoolsToDisplay.length > 1) filterLines.push({ label: 'ESCOLAS', value: `${schoolsToDisplay.length} escolas selecionadas` });
  if (filterInfo?.grade?.name) filterLines.push({ label: 'SÉRIE', value: filterInfo.grade.name });
  if (filterInfo?.class?.name) filterLines.push({ label: 'TURMA', value: filterInfo.class.name });
  if (filterInfo?.periodStart || filterInfo?.periodEnd) {
    filterLines.push({ label: 'PERÍODO', value: `${filterInfo.periodStart || '—'} → ${filterInfo.periodEnd || '—'}` });
  }

  const evalLabel = evaluationNames?.length ? `${evaluationNames.length} ${instrumentLabel}` : `Nenhuma ${instrumentLabel.slice(0, -1)} selecionada`;
  filterLines.push({ label: instrumentLabel === 'gabaritos' ? 'GABARITOS' : 'AVALIAÇÕES', value: evalLabel });

  const cardH = Math.max(64, 24 + filterLines.length * rowH + 16);
  pdf.setFillColor(...COLORS.bgLight);
  pdf.rect(cardX, currentY, cardW, cardH, 'F');
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(cardX, currentY, ACCENT_W, cardH, 'F');
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.4);
  pdf.rect(cardX, currentY, cardW, cardH, 'S');

  let cy = currentY + 12;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...COLORS.primary);
  pdf.text('FILTROS APLICADOS', cardX + ACCENT_W + (cardW - ACCENT_W) / 2, cy, { align: 'center' });
  cy += 6;
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.3);
  pdf.line(cardX + ACCENT_W + 4, cy, cardX + cardW - 4, cy);
  cy += 10;

  const labelX = cardX + ACCENT_W + 10;
  const valueX = cardX + ACCENT_W + 48;
  const maxValueW = cardW - (valueX - cardX) - 10;
  pdf.setFontSize(9);
  for (const { label, value } of filterLines) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.text(`${label}:`, labelX, cy);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    const vLines = pdf.splitTextToSize(String(value || '—'), maxValueW);
    pdf.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 5);
  }

  currentY += cardH + 12;

  // Seção de Análise Estatística / Análise de Evolução
  if (processedData) {
    // Calcular estatísticas gerais
    const calculateGeneralStats = (data: ProcessedEvolutionData) => {
      if (!data.generalData || data.generalData.length === 0) return null;
      
      const merged = data.generalData.reduce((acc, item) => {
        const key = (item.name || 'Geral').trim();
        if (!acc[key]) acc[key] = { name: key, etapas: [] };
        
        for (let i = 1; i <= 10; i++) {
          const etapaKey = `etapa${i}` as keyof typeof item;
          const value = (item as any)[etapaKey];
          if (value !== undefined && value !== null && typeof value === 'number') {
            acc[key].etapas.push(value);
          }
        }
        return acc;
      }, {} as Record<string, { name: string; etapas: number[] }>);

      const geral = Object.values(merged)[0];
      if (!geral || geral.etapas.length === 0) return null;

      const etapas = geral.etapas;
      const media = etapas.reduce((sum, val) => sum + val, 0) / etapas.length;
      const variacaoTotal = etapas.length > 1 
        ? ((etapas[etapas.length - 1] - etapas[0]) / etapas[0]) * 100
        : 0;

      return {
        media,
        variacaoTotal,
        totalAvaliacoes: etapas.length,
      };
    };

    const generalStats = calculateGeneralStats(processedData);

    if (generalStats) {
      // Título da seção
      pdf.setFontSize(14);
      pdf.setTextColor(...COLORS.primary);
      pdf.setFont('helvetica', 'bold');
      pdf.text('ANÁLISE DE EVOLUÇÃO GERAL', margin, currentY);

      currentY += 15;

      // Layout em grid 2x2 para os cards
      const cardWidth = (pageWidth - 2 * margin - 10) / 2; // 2 colunas com gap de 10mm
      const cardHeight = 35;
      const cardGap = 10;
      const leftColX = margin;
      const rightColX = margin + cardWidth + cardGap;

      // Card 1: Média Geral
      pdf.setFillColor(...COLORS.bgLight);
      pdf.rect(leftColX, currentY, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(...COLORS.borderLight);
      pdf.setLineWidth(0.5);
      pdf.rect(leftColX, currentY, cardWidth, cardHeight, 'S');
      
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Média Geral', leftColX + 8, currentY + 8);
      
      pdf.setFontSize(16);
      pdf.setTextColor(...COLORS.textDark);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${generalStats.media.toFixed(1).replace('.', ',')}`, leftColX + 8, currentY + 18);
      
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('pontos', leftColX + 8, currentY + 25);

      // Variação Total
      pdf.setFillColor(...COLORS.bgLight);
      pdf.rect(rightColX, currentY, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(...COLORS.borderLight);
      pdf.setLineWidth(0.5);
      pdf.rect(rightColX, currentY, cardWidth, cardHeight, 'S');
      
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Variação Total', rightColX + 8, currentY + 8);
      
      const variacaoColor = generalStats.variacaoTotal > 0 ? [16, 185, 129] : generalStats.variacaoTotal < 0 ? [239, 68, 68] : COLORS.textGray;
      pdf.setFontSize(16);
      pdf.setTextColor(variacaoColor[0], variacaoColor[1], variacaoColor[2]);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${generalStats.variacaoTotal > 0 ? '+' : ''}${generalStats.variacaoTotal.toFixed(1).replace('.', ',')}%`, rightColX + 8, currentY + 18);
      
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('período', rightColX + 8, currentY + 25);

      currentY += cardHeight + 10;

      // Total de Avaliações
      pdf.setFillColor(...COLORS.bgLight);
      pdf.rect(leftColX, currentY, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(...COLORS.borderLight);
      pdf.setLineWidth(0.5);
      pdf.rect(leftColX, currentY, cardWidth, cardHeight, 'S');
      
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Total de Avaliações', leftColX + 8, currentY + 8);
      
      pdf.setFontSize(16);
      pdf.setTextColor(...COLORS.textDark);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${generalStats.totalAvaliacoes}`, leftColX + 8, currentY + 18);
      
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.textGray);
      pdf.setFont('helvetica', 'normal');
      pdf.text('avaliações', leftColX + 8, currentY + 25);
    }
  }
}

/**
 * Adiciona capa ao PDF no padrão de AcertoNiveis.tsx
 */
async function addCoverPage(
  pdf: any,
  pageWidth: number,
  pageHeight: number,
  evaluationNames: string[],
  comparisonData: ComparisonResponse | null,
  filterInfo: FilterInfo | null,
  logoAsset: PdfImageAsset | null
): Promise<void> {
  // Garantir fundo branco limpo
  pdf.setFillColor(...COLORS.white);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  const centerX = pageWidth / 2;
  const BAND_H = 58;

  // Faixa superior roxa
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(0, 0, pageWidth, BAND_H, 'F');

  // Logo na faixa
  let logoBottomInBand = 0;
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const desiredLogoWidth = 38;
    const desiredLogoHeight = (logoAsset.ih * desiredLogoWidth) / logoAsset.iw;
    pdf.addImage(logoAsset.dataUrl, 'PNG', centerX - desiredLogoWidth / 2, 7, desiredLogoWidth, desiredLogoHeight);
    logoBottomInBand = 7 + desiredLogoHeight;
  } else {
    pdf.setFontSize(18);
    pdf.setTextColor(...COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AFIRME PLAY', centerX, 22, { align: 'center' });
    logoBottomInBand = 28;
  }

  // Título na faixa
  const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
  pdf.setTextColor(...COLORS.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('ANÁLISE DE EVOLUÇÃO', centerX, titleY, { align: 'center' });
  pdf.setFontSize(11);
  pdf.text('RELATÓRIO DE COMPARAÇÃO DE AVALIAÇÕES', centerX, titleY + 8, { align: 'center' });

  let y = BAND_H + 13;

  // Município - Estado (extrair de filterInfo)
  const municipio = filterInfo?.municipality?.name || 'MUNICÍPIO';
  const estado = filterInfo?.state?.name || 'ALAGOAS';
  
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.primary);
  pdf.setFont('helvetica', 'bold');
  const locationText = `${municipio.toUpperCase()} - ${estado.toUpperCase()}`;
  pdf.text(locationText, centerX, y, { align: 'center' });

  y += 8;

  // Secretaria
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORS.textGray);
  pdf.setFont('helvetica', 'normal');
  pdf.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });

  y += 20;

  // Card de informações - aumentado para acomodar melhor o conteúdo
  const cardWidth = pageWidth - 80; // Reduzir margens laterais (era 120)
  const cardX = (pageWidth - cardWidth) / 2;
  
  // Calcular altura necessária para o card com mais espaço
  let estimatedCardHeight = 60; // Base aumentada
  // Removido: AVALIAÇÕES COMPARADAS (já aparece na página de informações)
  estimatedCardHeight += filterInfo?.municipality || filterInfo?.state ? 7 : 0; // Estado/Município
  estimatedCardHeight += (filterInfo?.schools && filterInfo.schools.length > 0) || filterInfo?.school ? 12 : 0; // Escola (pode ter múltiplas linhas)
  estimatedCardHeight += filterInfo?.grade ? 7 : 0; // Série
  estimatedCardHeight += filterInfo?.class ? 7 : 0; // Turma
  estimatedCardHeight += 7; // Total de Avaliações
  estimatedCardHeight += comparisonData ? 7 : 0; // Comparações Realizadas
  estimatedCardHeight += 8; // Espaço para data
  const cardHeight = Math.max(estimatedCardHeight, 100); // Altura mínima aumentada

  const ACCENT_W = 4;

  // Fundo do card + acento lateral
  pdf.setFillColor(...COLORS.bgLight);
  pdf.rect(cardX, y, cardWidth, cardHeight, 'F');
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(cardX, y, ACCENT_W, cardHeight, 'F');
  
  // Borda do card
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.4);
  pdf.rect(cardX, y, cardWidth, cardHeight, 'S');

  // Conteúdo do card
  let cardY = y + 12;
  const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;

  // Título do card - tamanho aumentado
  pdf.setFontSize(13);
  pdf.setTextColor(...COLORS.primary);
  pdf.setFont('helvetica', 'bold');
  pdf.text('INFORMAÇÕES DA COMPARAÇÃO', cardContentCenterX, cardY, { align: 'center' });

  cardY += 6;
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.3);
  pdf.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
  cardY += 8;

  // Informações em formato tabular (label: valor) - tamanhos aumentados
  pdf.setFontSize(9); // Aumentado de 8 para 9
  pdf.setFont('helvetica', 'normal');

  const leftColX = cardX + ACCENT_W + 15; // Margem interna aumentada
  const labelWidth = 50; // Largura do label aumentada para acomodar textos maiores

  // Removido: AVALIAÇÕES COMPARADAS (já aparece na página de informações do relatório)

  // ESTADO | Município
  if (filterInfo?.state || filterInfo?.municipality) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(9);
    pdf.text('ESTADO:', leftColX, cardY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    const estadoMunicipioText = filterInfo.state && filterInfo.municipality
      ? `${estado} | Município: ${municipio}`
      : filterInfo.state
      ? estado
      : municipio;
    const estadoMunicipioMaxWidth = cardWidth - labelWidth - 30;
    const estadoMunicipioLines = pdf.splitTextToSize(estadoMunicipioText, estadoMunicipioMaxWidth);
    pdf.text(estadoMunicipioLines, leftColX + labelWidth, cardY);
    cardY += Math.max(7, estadoMunicipioLines.length * 5);
  }

  // ESCOLA(S)
  const schoolsToDisplay = filterInfo?.schools && filterInfo.schools.length > 0 
    ? filterInfo.schools 
    : filterInfo?.school 
      ? [filterInfo.school]
      : [];
  
  if (schoolsToDisplay.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(9);
    pdf.text(schoolsToDisplay.length > 1 ? 'ESCOLAS:' : 'ESCOLA:', leftColX, cardY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    const escolaText = schoolsToDisplay.length === 1 
      ? schoolsToDisplay[0].name.toUpperCase()
      : `${schoolsToDisplay.length} Escolas`;
    const escolaMaxWidth = cardWidth - labelWidth - 30;
    const escolaLines = pdf.splitTextToSize(escolaText, escolaMaxWidth);
    pdf.text(escolaLines, leftColX + labelWidth, cardY);
    cardY += Math.max(7, escolaLines.length * 5);
  }

  // SÉRIE
  if (filterInfo?.grade) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(9);
    pdf.text('SÉRIE:', leftColX, cardY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    pdf.text(filterInfo.grade.name, leftColX + labelWidth, cardY);
    cardY += 7;
  }

  // TURMA
  if (filterInfo?.class) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(9);
    pdf.text('TURMA:', leftColX, cardY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    pdf.text(filterInfo.class.name, leftColX + labelWidth, cardY);
    cardY += 7;
  }

  // TOTAL DE AVALIAÇÕES
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.primary);
  pdf.setFontSize(9);
  pdf.text('TOTAL DE AVALIAÇÕES:', leftColX, cardY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.textDark);
  pdf.text(`${evaluationNames.length}`, leftColX + labelWidth, cardY);
  cardY += 7;

  // COMPARAÇÕES REALIZADAS
  if (comparisonData) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(9);
    pdf.text('COMPARAÇÕES REALIZADAS:', leftColX, cardY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textDark);
    const totalComparisons = comparisonData.total_comparisons || (evaluationNames.length > 1 ? evaluationNames.length - 1 : 0);
    pdf.text(`${totalComparisons}`, leftColX + labelWidth, cardY);
    cardY += 7;
  }

  // (removido) Data de geração no rodapé do card
}

/**
 * Adiciona página divisória para uma categoria de gráficos (design simples e profissional)
 */
async function addCategoryDivider(
  pdf: any,
  pageWidth: number,
  pageHeight: number,
  categoryTitle: string,
  categoryDescription: string,
  filterInfo?: FilterInfo | null,
  evaluationNames?: string[],
  ico?: { dataUrl: string; iw: number; ih: number } | null,
  reportLogo?: PdfImageAsset | null,
  processedData?: ProcessedEvolutionData | null,
  instrumentLabel = 'avaliações'
): Promise<void> {
  // Garantir fundo branco
  pdf.setFillColor(...COLORS.white);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  const centerX = pageWidth / 2;
  const margin = 20;
  const BAND_H = 30;

  // Faixa superior roxa
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(0, 0, pageWidth, BAND_H, 'F');

  // Ícone na faixa (preferir ico); senão logo municipal/institucional
  if (ico?.dataUrl && ico.iw > 0 && ico.ih > 0) {
    const icoH = 14;
    const icoW = (ico.iw * icoH) / ico.ih;
    pdf.addImage(ico.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
  } else if (reportLogo?.dataUrl && reportLogo.iw > 0 && reportLogo.ih > 0) {
    const desiredLogoWidth = 22;
    const desiredLogoHeight = (reportLogo.ih * desiredLogoWidth) / reportLogo.iw;
    pdf.addImage(
      reportLogo.dataUrl,
      'PNG',
      margin,
      (BAND_H - desiredLogoHeight) / 2,
      desiredLogoWidth,
      desiredLogoHeight
    );
  }

  // Título na faixa
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...COLORS.white);
  pdf.text(categoryTitle.toUpperCase(), pageWidth / 2, BAND_H / 2 + 2, { align: 'center' });

  let y = BAND_H + 18;

  // Descrição
  pdf.setFontSize(12);
  pdf.setTextColor(...COLORS.textDark);
  pdf.setFont('helvetica', 'bold');
  const lines = pdf.splitTextToSize(categoryDescription, pageWidth - 2 * margin);
  pdf.text(lines, centerX, y, { align: 'center' });

  y += lines.length * 6 + 10;

  const scopeEvaluations = sortEvaluationsByOrder(processedData?.evaluations ?? []);
  const contentX = margin + 14;
  const contentMaxW = pageWidth - margin * 2 - 14;

  let cardContentHeight = 36;
  cardContentHeight += scopeEvaluations.length > 0 ? scopeEvaluations.length * 16 : 7;
  const cardH = Math.max(44, cardContentHeight);

  // Card com resumo do escopo
  const cardW = pageWidth - margin * 2;
  const cardX = margin;
  const ACCENT_W = 4;
  pdf.setFillColor(...COLORS.bgLight);
  pdf.rect(cardX, y, cardW, cardH, 'F');
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(cardX, y, ACCENT_W, cardH, 'F');
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.4);
  pdf.rect(cardX, y, cardW, cardH, 'S');

  let cy = y + 12;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...COLORS.primary);
  pdf.text('RESUMO DO ESCOPO', cardX + ACCENT_W + (cardW - ACCENT_W) / 2, cy, { align: 'center' });
  cy += 6;
  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.3);
  pdf.line(cardX + ACCENT_W + 4, cy, cardX + cardW - 4, cy);
  cy += 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.textDark);
  const muni = filterInfo?.municipality?.name || '—';
  pdf.text(`Município: ${muni}`, contentX, cy);
  cy += 7;

  if (scopeEvaluations.length > 0) {
    for (const [index, ev] of scopeEvaluations.entries()) {
      const grades = formatEvaluationGradeNames(ev) || '—';
      const classes = formatEvaluationClassNames(ev) || '—';
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const titleLines = pdf.splitTextToSize(`${index + 1}. ${ev.title}`, contentMaxW) as string[];
      pdf.text(titleLines, contentX, cy);
      cy += titleLines.length * 4.5;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const scopeLine = `Série: ${grades}  •  Turmas: ${classes}`;
      const scopeLines = pdf.splitTextToSize(scopeLine, contentMaxW) as string[];
      pdf.text(scopeLines, contentX, cy);
      cy += scopeLines.length * 4.5 + 3;
    }
  } else {
    const grade = filterInfo?.grade?.name || '—';
    const turma = filterInfo?.class?.name || '—';
    const turno = (filterInfo?.class as { shift?: string } | undefined)?.shift?.trim() || '';
    pdf.text(
      turno
        ? `Série: ${grade}  •  Turma: ${turma}  •  Turno: ${turno}`
        : `Série: ${grade}  •  Turma: ${turma}`,
      contentX,
      cy
    );
    cy += 7;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const evalLabel = instrumentLabel === 'gabaritos' ? 'Gabaritos' : 'Avaliações';
  pdf.text(`${evalLabel}: ${evaluationNames?.length ? evaluationNames.length : '0'}`, contentX, cy);
}

/**
 * Adiciona rodapé em todas as páginas do PDF (padrão AcertoNiveis.tsx)
 */
function addFootersToAllPages(
  pdf: any,
  pageHeight: number,
  totalPages: number
): void {
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.textGray);
    pdf.setFont('helvetica', 'normal');
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    
    // Esquerda: "Afirme Play Soluções Educativas"
    pdf.text('Afirme Play Soluções Educativas', margin, pageHeight - 10);
    
    // Centro: "Página X"
    pdf.text(`Página ${i}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Direita: Data e hora formatada
    const dateTime = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    pdf.text(dateTime, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }
}

/**
 * Adiciona cabeçalho nas páginas internas (padrão AcertoNiveis.tsx)
 */
function addHeader(
  pdf: any,
  pageWidth: number,
  filterInfo: FilterInfo | null,
  sectionTitle: string,
  ico?: { dataUrl: string; iw: number; ih: number } | null
): number {
  const margin = 15;
  const centerX = pageWidth / 2;
  const BAND_H = 20;

  pdf.setFillColor(...COLORS.primary);
  pdf.rect(0, 0, pageWidth, BAND_H, 'F');

  if (ico?.dataUrl && ico.iw > 0 && ico.ih > 0) {
    const icoH = 14;
    const icoW = (ico.iw * icoH) / ico.ih;
    pdf.addImage(ico.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
  } else {
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORS.white);
  pdf.text(sectionTitle, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });

  let y = BAND_H + 8;

  const municipio = filterInfo?.municipality?.name;
  if (municipio) {
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textDark);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`PREFEITURA DE ${municipio.toUpperCase()}`, centerX, y, { align: 'center' });
    y += 6;
  }

  pdf.setFontSize(8.5);
  pdf.setTextColor(...COLORS.textGray);
  pdf.setFont('helvetica', 'normal');

  const headerParts: string[] = [];

  const schoolsToDisplay = filterInfo?.schools && filterInfo.schools.length > 0
    ? filterInfo.schools
    : filterInfo?.school
      ? [filterInfo.school]
      : [];

  if (schoolsToDisplay.length > 0) {
    if (schoolsToDisplay.length === 1) {
      headerParts.push(`Escola: ${schoolsToDisplay[0].name}`);
    } else {
      headerParts.push(`${schoolsToDisplay.length} Escolas`);
    }
  }

  if (filterInfo?.grade) {
    headerParts.push(`Série: ${filterInfo.grade.name}`);
  }

  if (filterInfo?.class) {
    headerParts.push(`Turma: ${filterInfo.class.name}`);
    const turno = (filterInfo.class as { shift?: string }).shift?.trim();
    if (turno) headerParts.push(`Turno: ${turno}`);
  }

  if (headerParts.length > 0) {
    pdf.text(headerParts.join('  •  '), centerX, y, { align: 'center', maxWidth: pageWidth - 2 * margin });
    y += 6;
  }

  pdf.setDrawColor(...COLORS.borderLight);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 5;

  return y;
}

/**
 * Gera PDF a partir do layout HTML usando html2canvas e jsPDF
 * Agora captura cada seção separadamente para evitar cortes entre páginas
 */
export async function generateEvolutionPDFFromHTML(
  processedData: ProcessedEvolutionData,
  comparisonData: ComparisonResponse | null,
  evaluationNames: string[],
  filterInfo?: FilterInfo | null,
  instrumentLabel = 'avaliações'
): Promise<void> {
  try {
    // Importar bibliotecas dinamicamente
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).default;

    // Criar elemento temporário para renderizar o layout
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: -10000px;
      left: -10000px;
      width: 210mm;
      background: white;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    `;
    document.body.appendChild(container);

    // Renderizar o componente React no container
    const root = createRoot(container);
    
    await new Promise<void>((resolve) => {
      root.render(
        React.createElement(EvolutionPDFLayout, {
          processedData,
          comparisonData,
          evaluationNames,
        })
      );
      
      // Aguardar para garantir que o React renderizou completamente
      // e que os gráficos Recharts foram renderizados
      setTimeout(() => {
        const checkCharts = () => {
          const svgElements = container.querySelectorAll('svg');
          const expectedSections = container.querySelectorAll('[data-pdf-section]').length;
          // Verificar se temos SVGs e se temos pelo menos algumas seções renderizadas
          if (svgElements.length > 0 && expectedSections > 0) {
            // Tempo de espera para garantir que todos os gráficos foram renderizados
            setTimeout(resolve, 500);
          } else {
            setTimeout(checkCharts, 200);
          }
        };
        checkCharts();
      }, 300);
    });

    // Criar PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const marginTop = 15; // Margem superior
    const marginBottom = 15; // Margem inferior para rodapé
    const marginLeft = 15; // Margem esquerda
    const marginRight = 15; // Margem direita

    // Ícone para cabeçalhos internos
    const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
    const cityId = filterInfo?.municipality?.id ?? null;
    const { logo: reportLogo } = await loadCityBrandingForReportPdf(cityId);

    // Adicionar capa como primeira página
    await addCoverPage(
      pdf,
      imgWidth,
      pageHeight,
      evaluationNames,
      comparisonData,
      filterInfo || null,
      reportLogo
    );
    
    // Adicionar página de informações sobre filtros e avaliações
    pdf.addPage();
    addFiltersInfoPage(pdf, imgWidth, pageHeight, filterInfo || null, evaluationNames, processedData, icoAsset, instrumentLabel);
    
    // Não criar página vazia - a primeira página divisória ou gráfico criará quando necessário
    let currentY = marginTop;

    // Identificar todas as seções usando data-pdf-section
    const allSections = Array.from(container.querySelectorAll('[data-pdf-section]')) as HTMLElement[];

    // Organizar seções por categoria
    const generalSections: HTMLElement[] = [];
    const subjectSections: HTMLElement[] = [];
    const levelSections: HTMLElement[] = [];
    const otherSections: HTMLElement[] = [];

    allSections.forEach((section) => {
      const sectionId = section.getAttribute('data-pdf-section') || '';
      
      if (sectionId === 'general-charts') {
        generalSections.push(section);
      } else if (sectionId.startsWith('subject-')) {
        subjectSections.push(section);
      } else if (sectionId.startsWith('level-')) {
        levelSections.push(section);
      } else {
        otherSections.push(section);
      }
    });

    // Função auxiliar para adicionar seções
    const addSectionsToPDF = async (sections: HTMLElement[]) => {
      for (const sectionElement of sections) {
        try {
          // Capturar seção individual com alta resolução
          const sectionCanvas = await captureSection(sectionElement, html2canvas, 2.0);
          
          // Verificar se o canvas foi criado corretamente
          if (!sectionCanvas || sectionCanvas.width === 0 || sectionCanvas.height === 0) {
            console.warn('Canvas inválido para seção:', sectionElement);
            continue;
          }
          
          // Adicionar ao PDF (criando nova página se necessário)
          currentY = addSectionToPDF(
            pdf,
            sectionCanvas,
            currentY,
            pageHeight,
            marginTop,
            marginBottom,
            marginLeft,
            marginRight,
            imgWidth
          );
          
          // Liberar memória do canvas após uso
          sectionCanvas.width = 0;
          sectionCanvas.height = 0;
        } catch (error) {
          console.error('Erro ao capturar seção:', error);
          // Continuar com a próxima seção mesmo se uma falhar
        }
      }
    };

    // Removido: outras seções (header, summary, etc.) - página 3 removida conforme solicitado

    // Adicionar gráficos gerais com página divisória
    if (generalSections.length > 0) {
      // Criar página divisória
      pdf.addPage();
      await addCategoryDivider(
        pdf,
        imgWidth,
        pageHeight,
        'Gráficos Gerais',
        'Análise de Nota e Proficiência Geral',
        filterInfo || null,
        evaluationNames,
        icoAsset,
        reportLogo,
        processedData,
        instrumentLabel
      );
      // Criar página para os gráficos
      pdf.addPage();
      currentY = addHeader(pdf, imgWidth, filterInfo || null, 'GRÁFICOS GERAIS', icoAsset) || marginTop;
      await addSectionsToPDF(generalSections);
    }

    // Adicionar gráficos por disciplina com página divisória
    if (subjectSections.length > 0) {
      pdf.addPage();
      await addCategoryDivider(
        pdf,
        imgWidth,
        pageHeight,
        'Gráficos por Disciplina',
        'Análise Detalhada por Disciplina (Nota e Proficiência)',
        filterInfo || null,
        evaluationNames,
        icoAsset,
        reportLogo,
        processedData,
        instrumentLabel
      );
      pdf.addPage();
      currentY = addHeader(pdf, imgWidth, filterInfo || null, 'GRÁFICOS POR DISCIPLINA', icoAsset) || marginTop;
      await addSectionsToPDF(subjectSections);
    }

    // Adicionar gráficos por nível com página divisória
    if (levelSections.length > 0) {
      pdf.addPage();
      await addCategoryDivider(
        pdf,
        imgWidth,
        pageHeight,
        'Gráficos por Nível',
        'Análise de Proficiência por Níveis de Desempenho',
        filterInfo || null,
        evaluationNames,
        icoAsset,
        reportLogo,
        processedData,
        instrumentLabel
      );
      pdf.addPage();
      currentY = addHeader(pdf, imgWidth, filterInfo || null, 'GRÁFICOS POR NÍVEL', icoAsset) || marginTop;
      await addSectionsToPDF(levelSections);
    }

    // Remover elemento temporário
    document.body.removeChild(container);
    root.unmount();

    // Adicionar rodapé em todas as páginas
    const totalPages = pdf.getNumberOfPages();
    addFootersToAllPages(pdf, pageHeight, totalPages);

    // Salvar PDF
    const fileName = `relatorio-evolucao-${evaluationNames.join('-').replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}
