import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MatrizEscolaSerie, SerieColuna } from '@/types/relatorio-consolidado';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import { getAcertosMetaCellStyle } from '@/utils/reports/relatorioConsolidadoWebStyles';
import { cn } from '@/lib/utils';

export type MatrizCellFormat = 'percent' | 'decimal';

function formatCell(value: number | null, format: MatrizCellFormat): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return format === 'percent' ? formatPercent1PtBr(value) : formatDecimal1PtBr(value);
}

type MatrizNumericaTableProps = {
  seriesColunas: SerieColuna[];
  matriz: MatrizEscolaSerie;
  cellFormat?: MatrizCellFormat;
  totalColumnLabel?: string;
  footerLabel?: string;
  /** Colore células numéricas: verde >= 60%, vermelho < 60%. */
  colorizeByMeta?: boolean;
  className?: string;
};

export function MatrizNumericaTable({
  seriesColunas,
  matriz,
  cellFormat = 'percent',
  totalColumnLabel = 'TX. GERAL',
  footerLabel = 'MÉDIAS DA REDE',
  colorizeByMeta = false,
  className,
}: MatrizNumericaTableProps) {
  const colCount = seriesColunas.length;

  if (!matriz.linhas.length && colCount === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>;
  }

  const dataCellClass = 'text-center tabular-nums font-bold text-base';

  return (
    <div className={cn('overflow-x-auto rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-primary hover:bg-primary">
            <TableHead className="w-10 text-center text-primary-foreground">#</TableHead>
            <TableHead className="min-w-[160px] text-primary-foreground">ESCOLAS</TableHead>
            {seriesColunas.map((col) => (
              <TableHead
                key={col.serie_id}
                className="text-center whitespace-nowrap text-primary-foreground font-bold"
              >
                {col.serie_nome.toLocaleUpperCase('pt-BR')}
              </TableHead>
            ))}
            <TableHead className="text-center font-bold whitespace-nowrap text-primary-foreground">
              {totalColumnLabel}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matriz.linhas.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount + 3}
                className="text-center text-muted-foreground py-8"
              >
                Nenhuma escola com dados.
              </TableCell>
            </TableRow>
          ) : (
            matriz.linhas.map((linha, idx) => (
              <TableRow key={linha.escola_id}>
                <TableCell className="text-center font-bold tabular-nums text-primary text-base">
                  {idx + 1}
                </TableCell>
                <TableCell className="font-bold uppercase text-base">{linha.escola_nome}</TableCell>
                {linha.valores_por_serie.map((valor, j) => (
                  <TableCell
                    key={`${linha.escola_id}-${j}`}
                    className={dataCellClass}
                    style={colorizeByMeta ? getAcertosMetaCellStyle(valor) : undefined}
                  >
                    {formatCell(valor, cellFormat)}
                  </TableCell>
                ))}
                <TableCell
                  className={dataCellClass}
                  style={colorizeByMeta ? getAcertosMetaCellStyle(linha.taxa_geral_escola) : undefined}
                >
                  {formatCell(linha.taxa_geral_escola, cellFormat)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell />
            <TableCell className="font-bold text-primary">{footerLabel}</TableCell>
            {matriz.medias_da_rede.por_serie.map((valor, j) => (
              <TableCell
                key={`rede-${j}`}
                className={dataCellClass}
                style={colorizeByMeta ? getAcertosMetaCellStyle(valor) : undefined}
              >
                {formatCell(valor, cellFormat)}
              </TableCell>
            ))}
            <TableCell
              className={dataCellClass}
              style={colorizeByMeta ? getAcertosMetaCellStyle(matriz.medias_da_rede.taxa_geral) : undefined}
            >
              {formatCell(matriz.medias_da_rede.taxa_geral, cellFormat)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
