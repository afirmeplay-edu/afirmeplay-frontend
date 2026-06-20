import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';

export const MEDIAS_REDE_FOOTER_LABEL_REDE = 'MÉDIAS DA REDE';
export const MEDIAS_REDE_FOOTER_LABEL_MUNICIPAL = 'MÉDIA MUNICIPAL';

/** Escola filtrada vs benchmark municipal (`comparativo.ativo`). */
export function isComparativoEscolaVsRede(report: RelatorioConsolidado | undefined): boolean {
  return report?.comparativo?.ativo === true;
}

/** Rótulo da linha de rodapé das matrizes (rede municipal ou média municipal). */
export function getMediasRedeFooterLabel(report: RelatorioConsolidado | undefined): string {
  return isComparativoEscolaVsRede(report)
    ? MEDIAS_REDE_FOOTER_LABEL_MUNICIPAL
    : MEDIAS_REDE_FOOTER_LABEL_REDE;
}

export function getComparativoUiHint(report: RelatorioConsolidado | undefined): string | null {
  if (!isComparativoEscolaVsRede(report)) return null;
  return 'Modo comparativo: os valores das linhas referem-se à escola selecionada; a linha de rodapé exibe a média municipal (benchmark), calculada pelo backend.';
}

export function getRedeNivelLabel(report: RelatorioConsolidado | undefined): string {
  return isComparativoEscolaVsRede(report) ? 'Nível municipal' : 'Nível da rede';
}
