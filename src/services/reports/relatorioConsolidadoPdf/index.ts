export {
  drawRelatorioConsolidadoCoverPage,
  drawRelatorioConsolidadoHeaderLogo,
  RELATORIO_CONSOLIDADO_PDF_COLORS,
  type RelatorioConsolidadoCoverParams,
} from './drawCoverPage';
export {
  buildSumarioSections,
  formatSumarioSubsectionsLine,
  type SumarioSection,
} from './buildSumarioSections';
export { drawRelatorioConsolidadoSumarioPage } from './drawSumarioPage';
export { drawRelatorioConsolidadoApresentacaoPage } from './drawApresentacaoPage';
export {
  buildApresentacaoDynamicData,
  buildApresentacaoParagraph1Runs,
  buildApresentacaoParagraph2Runs,
  type ApresentacaoDynamicData,
  type ApresentacaoScopeOptions,
} from './buildApresentacaoData';
export { drawRelatorioConsolidadoFrequenciaPages } from './drawFrequenciaConsolidadoPages';
export { buildFaixaSeriesSubtitle, type FaixaSeriesSubtitle } from './buildFaixaSeriesSubtitle';
export {
  FREQUENCIA_PDF_CELL_COLORS,
  resolveFrequenciaSerieCellStyle,
} from './frequenciaPdfCellStyles';
export { drawRelatorioConsolidadoConsideracoesGeraisPage } from './drawConsideracoesGeraisPage';
export {
  drawRelatorioConsolidadoMediasNotaPages,
  drawRelatorioConsolidadoMediasProficienciaPages,
  drawRelatorioConsolidadoMediasSectionPages,
  type MediasConsolidadoPagesParams,
  type MediasConsolidadoSectionConfig,
} from './drawMediasConsolidadoPages';
export {
  buildMediasIntroRuns,
  buildMediasSubsectionLabel,
  buildMediasTableBandLabel,
  getMediasPdfDisciplinas,
} from './buildMediasIntroData';
export {
  resolveMediasValorCellStyle,
  type MediasPdfMetricKind,
  type MediasValorStyleContext,
} from './classifyMediasPdfFaixa';
export {
  LEGENDA_PROFICIENCIA_ROWS,
  MEDIAS_PDF_COLUMN_COLORS,
  PROFICIENCIA_FAIXA_ORDER,
  PROFICIENCIA_PDF_CELL_COLORS,
  getProficienciaFaixaStyle,
  resolveProficienciaNivelStyle,
  type LegendaProficienciaRow,
  type ProficienciaFaixaKey,
  type ProficienciaPdfCellStyle,
} from './proficienciaPdfCellStyles';
export {
  drawRelatorioConsolidadoAcertosHabilidadePages,
  type AcertosHabilidadePagesParams,
} from './drawAcertosHabilidadePages';
export {
  drawRelatorioConsolidadoDistribuicaoPages,
  type DistribuicaoProficienciaPagesParams,
} from './drawDistribuicaoProficienciaPages';
export {
  drawRelatorioConsolidadoFooters,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  drawRelatorioConsolidadoSubsectionTitle,
  drawPdfColoredBadge,
  drawPdfLegendTable,
  drawPdfTextRuns,
  PDF_MARGIN_X,
} from './pdfShared';
export {
  generateRelatorioConsolidadoPdf,
  type GenerateRelatorioConsolidadoPdfOptions,
} from './generateRelatorioConsolidadoPdf';
