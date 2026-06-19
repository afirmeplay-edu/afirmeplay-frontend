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
  className?: string;
};

export function MatrizNumericaTable({
  seriesColunas,
  matriz,
  cellFormat = 'percent',
  totalColumnLabel = 'TX. GERAL',
  className,
}: MatrizNumericaTableProps) {
  const colCount = seriesColunas.length;

  if (!matriz.linhas.length && colCount === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>;
  }

  return (
    <div className={cn('overflow-x-auto rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead className="min-w-[160px]">Escolas</TableHead>
            {seriesColunas.map((col) => (
              <TableHead key={col.serie_id} className="text-right whitespace-nowrap">
                {col.serie_nome}
              </TableHead>
            ))}
            <TableHead className="text-right font-semibold whitespace-nowrap">
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
                <TableCell className="text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                <TableCell className="font-medium">{linha.escola_nome}</TableCell>
                {linha.valores_por_serie.map((valor, j) => (
                  <TableCell key={`${linha.escola_id}-${j}`} className="text-right tabular-nums">
                    {formatCell(valor, cellFormat)}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCell(linha.taxa_geral_escola, cellFormat)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell />
            <TableCell>MÉDIAS DA REDE</TableCell>
            {matriz.medias_da_rede.por_serie.map((valor, j) => (
              <TableCell key={`rede-${j}`} className="text-right tabular-nums">
                {formatCell(valor, cellFormat)}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">
              {formatCell(matriz.medias_da_rede.taxa_geral, cellFormat)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
