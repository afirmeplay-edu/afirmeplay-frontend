import type {
  CelulaDistribuicao,
  MatrizDistribuicao,
  RelatorioConsolidado,
} from '@/types/relatorio-consolidado';
import type { ProficienciaFaixaKey } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import { LEGENDA_PROFICIENCIA_ROWS, PROFICIENCIA_FAIXA_ORDER } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import { isComparativoEscolaVsRede } from '@/utils/reports/relatorioConsolidadoComparativo';
import { formatPercent1PtBr } from '@/utils/numberFormat';

export type DistribuicaoPivotSource = {
  por_serie: Array<CelulaDistribuicao | null>;
  taxa_geral: CelulaDistribuicao | null;
};

export function getDistribuicaoPrimarySource(
  matriz: MatrizDistribuicao,
  comparativo: boolean
): DistribuicaoPivotSource {
  if (comparativo && matriz.linhas.length > 0) {
    const linha = matriz.linhas[0];
    return {
      por_serie: linha.valores_por_serie,
      taxa_geral: linha.taxa_geral_escola ?? null,
    };
  }
  return {
    por_serie: matriz.medias_da_rede.por_serie,
    taxa_geral: matriz.medias_da_rede.taxa_geral ?? null,
  };
}

export function getDistribuicaoRedeSource(matriz: MatrizDistribuicao): DistribuicaoPivotSource {
  return {
    por_serie: matriz.medias_da_rede.por_serie,
    taxa_geral: matriz.medias_da_rede.taxa_geral ?? null,
  };
}

export function isDistribuicaoComparativo(report: RelatorioConsolidado | undefined): boolean {
  return isComparativoEscolaVsRede(report);
}

export function formatDistribuicaoPercent(
  celula: CelulaDistribuicao | null | undefined,
  faixa: ProficienciaFaixaKey
): string {
  if (!celula || celula.total_registros === 0) return '-';
  return formatPercent1PtBr(celula.percentuais[faixa] ?? 0);
}

export function formatDistribuicaoContagem(
  celula: CelulaDistribuicao | null | undefined,
  faixa: ProficienciaFaixaKey
): string {
  if (!celula || celula.total_registros === 0) return '-';
  return String(Math.round(celula.contagens[faixa] ?? 0));
}

export function formatDistribuicaoTotalAlunos(celula: CelulaDistribuicao | null | undefined): string {
  if (!celula || celula.total_registros === 0) return '-';
  return String(Math.round(celula.total_registros));
}

export { LEGENDA_PROFICIENCIA_ROWS, PROFICIENCIA_FAIXA_ORDER };
