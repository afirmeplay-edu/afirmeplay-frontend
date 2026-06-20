import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MatrizDistribuicao, SerieColuna } from '@/types/relatorio-consolidado';
import type { ProficienciaFaixaKey } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import { RelatorioSubsectionTitle } from '@/components/reports/relatorio-geral/RelatorioSectionTitle';
import { cn } from '@/lib/utils';
import {
  formatDistribuicaoContagem,
  formatDistribuicaoPercent,
  formatDistribuicaoTotalAlunos,
  getDistribuicaoPrimarySource,
  getDistribuicaoRedeSource,
  LEGENDA_PROFICIENCIA_ROWS,
  PROFICIENCIA_FAIXA_ORDER,
} from '@/utils/reports/relatorioConsolidadoDistribuicao';
import {
  getDistribuicaoFaixaLabelStyle,
  getDistribuicaoFooterCellStyle,
  getDistribuicaoFooterLabelStyle,
  getDistribuicaoFooterTotalStyle,
  getDistribuicaoMediaColumnStyle,
} from '@/utils/reports/relatorioConsolidadoWebStyles';

type DistribuicaoProficienciaTablesProps = {
  seriesColunas: SerieColuna[];
  matriz: MatrizDistribuicao;
  comparativo: boolean;
  footerRedeLabel: string;
  quantitativoSubtitle?: string;
  showRedeNivel?: boolean;
  redeNivel?: string | null;
  className?: string;
};

function FaixaLabelCell({ faixa }: { faixa: ProficienciaFaixaKey }) {
  const row = LEGENDA_PROFICIENCIA_ROWS.find((r) => r.key === faixa);
  const style = getDistribuicaoFaixaLabelStyle(faixa);
  return (
    <TableCell className="font-bold text-sm whitespace-nowrap" style={style}>
      {row?.label ?? faixa}
    </TableCell>
  );
}

export function DistribuicaoProficienciaTables({
  seriesColunas,
  matriz,
  comparativo,
  footerRedeLabel,
  quantitativoSubtitle,
  showRedeNivel = false,
  redeNivel,
  className,
}: DistribuicaoProficienciaTablesProps) {
  const primary = getDistribuicaoPrimarySource(matriz, comparativo);
  const rede = getDistribuicaoRedeSource(matriz);
  const showRedeFooter = comparativo;

  const dataCellClass = 'text-center tabular-nums font-bold text-base';

  return (
    <div className={cn('space-y-6', className)}>
      {showRedeNivel && redeNivel && (
        <p className="text-sm text-muted-foreground">
          Nível de referência: <span className="font-semibold text-foreground">{redeNivel}</span>
        </p>
      )}

      {/* Tabela 1 — percentuais */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary">
              <TableHead className="min-w-[180px] text-primary-foreground font-bold">
                NÍVEIS DE PROFICIÊNCIA
              </TableHead>
              {seriesColunas.map((col) => (
                <TableHead
                  key={`pct-h-${col.serie_id}`}
                  className="text-center whitespace-nowrap text-primary-foreground font-bold"
                >
                  {col.serie_nome.toLocaleUpperCase('pt-BR')}
                </TableHead>
              ))}
              <TableHead className="text-center font-bold whitespace-nowrap text-primary-foreground">
                MÉDIA
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROFICIENCIA_FAIXA_ORDER.map((faixa) => (
              <TableRow key={`pct-${faixa}`}>
                <FaixaLabelCell faixa={faixa} />
                {primary.por_serie.map((celula, j) => (
                  <TableCell key={`pct-${faixa}-${j}`} className={dataCellClass}>
                    {formatDistribuicaoPercent(celula, faixa)}
                  </TableCell>
                ))}
                <TableCell
                  className={dataCellClass}
                  style={getDistribuicaoMediaColumnStyle()}
                >
                  {formatDistribuicaoPercent(primary.taxa_geral, faixa)}
                </TableCell>
              </TableRow>
            ))}
            {showRedeFooter &&
              PROFICIENCIA_FAIXA_ORDER.map((faixa, faixaIdx) => (
                <TableRow
                  key={`pct-rede-${faixa}`}
                  className={cn(faixaIdx === 0 && 'border-t-2 border-primary/30')}
                >
                  {faixaIdx === 0 ? (
                    <TableCell
                      className="font-bold text-sm align-middle"
                      style={{
                        ...getDistribuicaoFooterLabelStyle(),
                        backgroundColor: 'rgb(243, 232, 255)',
                      }}
                      rowSpan={PROFICIENCIA_FAIXA_ORDER.length}
                    >
                      {`${footerRedeLabel} (%)`}
                    </TableCell>
                  ) : null}
                  {rede.por_serie.map((celula, j) => (
                    <TableCell
                      key={`pct-rede-${faixa}-${j}`}
                      className={cn(dataCellClass, faixaIdx > 0 && 'border-t-0 py-1')}
                      style={getDistribuicaoFooterCellStyle()}
                    >
                      {formatDistribuicaoPercent(celula, faixa)}
                    </TableCell>
                  ))}
                  <TableCell
                    className={cn(dataCellClass, faixaIdx > 0 && 'border-t-0 py-1')}
                    style={
                      faixaIdx === PROFICIENCIA_FAIXA_ORDER.length - 1
                        ? getDistribuicaoFooterTotalStyle()
                        : getDistribuicaoFooterCellStyle()
                    }
                  >
                    {formatDistribuicaoPercent(rede.taxa_geral, faixa)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {quantitativoSubtitle && (
        <RelatorioSubsectionTitle label={quantitativoSubtitle} className="text-sm" />
      )}

      {/* Tabela 2 — quantitativo */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary">
              <TableHead className="min-w-[180px] text-primary-foreground font-bold">
                NÍVEIS DE PROFICIÊNCIA
              </TableHead>
              {seriesColunas.map((col) => (
                <TableHead
                  key={`cnt-h-${col.serie_id}`}
                  className="text-center whitespace-nowrap text-primary-foreground font-bold"
                >
                  {col.serie_nome.toLocaleUpperCase('pt-BR')}
                </TableHead>
              ))}
              <TableHead className="text-center font-bold whitespace-nowrap text-primary-foreground">
                TOTAL
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROFICIENCIA_FAIXA_ORDER.map((faixa) => (
              <TableRow key={`cnt-${faixa}`}>
                <FaixaLabelCell faixa={faixa} />
                {primary.por_serie.map((celula, j) => (
                  <TableCell key={`cnt-${faixa}-${j}`} className={dataCellClass}>
                    {formatDistribuicaoContagem(celula, faixa)}
                  </TableCell>
                ))}
                <TableCell
                  className={dataCellClass}
                  style={getDistribuicaoMediaColumnStyle()}
                >
                  {formatDistribuicaoContagem(primary.taxa_geral, faixa)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-bold text-sm" style={getDistribuicaoFooterLabelStyle()}>
                TOTAL DE ALUNOS
              </TableCell>
              {primary.por_serie.map((celula, j) => (
                <TableCell
                  key={`cnt-total-${j}`}
                  className={dataCellClass}
                  style={getDistribuicaoFooterCellStyle()}
                >
                  {formatDistribuicaoTotalAlunos(celula)}
                </TableCell>
              ))}
              <TableCell className={dataCellClass} style={getDistribuicaoFooterTotalStyle()}>
                {formatDistribuicaoTotalAlunos(primary.taxa_geral)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
