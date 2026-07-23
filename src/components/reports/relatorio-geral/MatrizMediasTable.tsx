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
import { formatDecimal1PtBr } from '@/utils/numberFormat';
import type { MediasPdfMetricKind } from '@/utils/reports/relatorioConsolidadoWebStyles';
import {
  getMediasFooterMediaCellStyle,
  getMediasMediaColumnCellStyle,
  getMediasSerieCellStyle,
} from '@/utils/reports/relatorioConsolidadoWebStyles';
import { cn } from '@/lib/utils';

function formatCell(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return formatDecimal1PtBr(value);
}

type MatrizMediasTableProps = {
  seriesColunas: SerieColuna[];
  matriz: MatrizEscolaSerie;
  metricKind: MediasPdfMetricKind;
  disciplina: string;
  faixaTitulo: string;
  footerLabel?: string;
  className?: string;
};

export function MatrizMediasTable({
  seriesColunas,
  matriz,
  metricKind,
  disciplina,
  faixaTitulo,
  footerLabel = 'MÉDIAS DA REDE',
  className,
}: MatrizMediasTableProps) {
  const colCount = seriesColunas.length;

  if (!matriz.linhas.length && colCount === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>;
  }

  const valorContext = (serieNome?: string) => ({
    metricKind,
    disciplina,
    faixaTitulo,
    serieNome,
  });

  const serieHeadClass =
    'text-center text-primary-foreground font-bold min-w-[7.5rem] px-2 whitespace-nowrap';
  const dataCellClass = 'text-center tabular-nums font-bold text-base whitespace-nowrap px-2';

  return (
    <div className={cn('w-full min-w-0 overflow-x-auto rounded-md border', className)}>
      <Table className="w-max min-w-full">
        <TableHeader>
          <TableRow className="bg-primary hover:bg-primary">
            <TableHead className="w-10 shrink-0 text-center text-primary-foreground">#</TableHead>
            <TableHead className="min-w-[12rem] max-w-[18rem] text-primary-foreground">ESCOLAS</TableHead>
            {seriesColunas.map((col) => (
              <TableHead key={col.serie_id} className={serieHeadClass}>
                {col.serie_nome.toLocaleUpperCase('pt-BR')}
              </TableHead>
            ))}
            <TableHead className="text-center font-bold whitespace-nowrap text-primary-foreground min-w-[5.5rem] px-2">
              MÉDIA
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
                <TableCell className="font-bold uppercase text-base min-w-[12rem] max-w-[18rem] break-words">
                  {linha.escola_nome}
                </TableCell>
                {linha.valores_por_serie.map((valor, j) => (
                  <TableCell
                    key={`${linha.escola_id}-${j}`}
                    className={dataCellClass}
                    style={getMediasSerieCellStyle(
                      valor,
                      linha.niveis_por_serie?.[j] ?? null,
                      valorContext(seriesColunas[j]?.serie_nome)
                    )}
                  >
                    {formatCell(valor)}
                  </TableCell>
                ))}
                <TableCell
                  className={dataCellClass}
                  style={getMediasMediaColumnCellStyle()}
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
            <TableCell className="font-bold text-primary min-w-[12rem] max-w-[18rem]">{footerLabel}</TableCell>
            {matriz.medias_da_rede.por_serie.map((valor, j) => (
              <TableCell
                key={`rede-${j}`}
                className={dataCellClass}
                style={getMediasSerieCellStyle(
                  valor,
                  matriz.medias_da_rede.niveis_por_serie?.[j] ?? null,
                  valorContext(seriesColunas[j]?.serie_nome)
                )}
              >
                {formatCell(valor)}
              </TableCell>
            ))}
            <TableCell
              className={dataCellClass}
              style={getMediasFooterMediaCellStyle()}
            >
              {formatCell(matriz.medias_da_rede.taxa_geral)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
