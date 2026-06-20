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
import { formatPercent1PtBr } from '@/utils/numberFormat';
import {
  getFrequenciaFooterTaxaGeralCellStyle,
  getFrequenciaSerieCellStyle,
  getFrequenciaTaxaGeralCellStyle,
} from '@/utils/reports/relatorioConsolidadoWebStyles';
import { cn } from '@/lib/utils';

function formatCell(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return formatPercent1PtBr(value);
}

type MatrizFrequenciaTableProps = {
  seriesColunas: SerieColuna[];
  matriz: MatrizEscolaSerie;
  footerLabel?: string;
  className?: string;
};

export function MatrizFrequenciaTable({
  seriesColunas,
  matriz,
  footerLabel = 'MÉDIAS DA REDE',
  className,
}: MatrizFrequenciaTableProps) {
  const colCount = seriesColunas.length;

  if (!matriz.linhas.length && colCount === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>;
  }

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
              TX. GERAL
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matriz.linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount + 3} className="text-center text-muted-foreground py-8">
                Nenhuma escola com dados.
              </TableCell>
            </TableRow>
          ) : (
            matriz.linhas.map((linha, idx) => (
              <TableRow key={linha.escola_id}>
                <TableCell className="text-center font-bold tabular-nums text-primary text-base">{idx + 1}</TableCell>
                <TableCell className="font-bold uppercase text-base">{linha.escola_nome}</TableCell>
                {linha.valores_por_serie.map((valor, j) => (
                  <TableCell
                    key={`${linha.escola_id}-${j}`}
                    className="text-center tabular-nums font-bold text-base"
                    style={getFrequenciaSerieCellStyle(valor)}
                  >
                    {formatCell(valor)}
                  </TableCell>
                ))}
                <TableCell
                  className="text-center tabular-nums font-bold text-base"
                  style={getFrequenciaTaxaGeralCellStyle()}
                >
                  {formatCell(linha.taxa_geral_escola)}
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
                className="text-center tabular-nums font-bold text-base"
                style={getFrequenciaSerieCellStyle(valor)}
              >
                {formatCell(valor)}
              </TableCell>
            ))}
            <TableCell
              className="text-center tabular-nums font-bold text-base"
              style={getFrequenciaFooterTaxaGeralCellStyle()}
            >
              {formatCell(matriz.medias_da_rede.taxa_geral)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
