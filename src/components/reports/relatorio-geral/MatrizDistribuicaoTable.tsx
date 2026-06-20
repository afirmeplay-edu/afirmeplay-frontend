import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CelulaDistribuicao, MatrizDistribuicao, SerieColuna } from '@/types/relatorio-consolidado';
import { formatPercent1PtBr } from '@/utils/numberFormat';
import {
  getReportProficiencyTagClass,
  normalizeProficiencyLevelLabel,
} from '@/utils/report/reportTagStyles';
import { cn } from '@/lib/utils';

const FAIXA_ORDER = ['abaixo_do_basico', 'basico', 'adequado', 'avancado'] as const;

const FAIXA_SHORT: Record<(typeof FAIXA_ORDER)[number], string> = {
  abaixo_do_basico: 'AB',
  basico: 'B',
  adequado: 'A',
  avancado: 'Av',
};

function CelulaDistribuicaoView({ celula, compact }: { celula: CelulaDistribuicao | null; compact?: boolean }) {
  if (!celula || celula.total_registros === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (compact) {
    const parts = FAIXA_ORDER.map((faixa) => {
      const pct = celula.percentuais[faixa] ?? 0;
      if (pct <= 0) return null;
      return `${FAIXA_SHORT[faixa]} ${formatPercent1PtBr(pct)}`;
    }).filter(Boolean);

    return (
      <div className="text-[10px] leading-tight space-y-0.5 min-w-[72px]">
        {parts.length > 0 ? (
          parts.map((part, i) => <div key={i}>{part}</div>)
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
        <div className="text-muted-foreground">n={celula.total_registros}</div>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-1 min-w-[100px]">
      {FAIXA_ORDER.map((faixa) => (
        <div key={faixa} className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted-foreground">{FAIXA_SHORT[faixa]}</span>
          <span>
            {celula.contagens[faixa]} ({formatPercent1PtBr(celula.percentuais[faixa])})
          </span>
        </div>
      ))}
      <div className="text-muted-foreground border-t pt-1">Total: {celula.total_registros}</div>
    </div>
  );
}

type MatrizDistribuicaoTableProps = {
  seriesColunas: SerieColuna[];
  matriz: MatrizDistribuicao;
  showRedeNivel?: boolean;
  footerLabel?: string;
  redeNivelLabel?: string;
  className?: string;
};

export function MatrizDistribuicaoTable({
  seriesColunas,
  matriz,
  showRedeNivel = false,
  footerLabel = 'MÉDIAS DA REDE',
  redeNivelLabel = 'Nível da rede',
  className,
}: MatrizDistribuicaoTableProps) {
  const colCount = seriesColunas.length;
  const redeNivel = matriz.medias_da_rede.media_da_rede_nivel;

  return (
    <div className={cn('space-y-3', className)}>
      {showRedeNivel && redeNivel && (
        <p className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">{redeNivelLabel}:</span>
          <span className={getReportProficiencyTagClass(normalizeProficiencyLevelLabel(redeNivel))}>
            {normalizeProficiencyLevelLabel(redeNivel)}
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead className="min-w-[140px]">Escolas</TableHead>
              {seriesColunas.map((col) => (
                <TableHead key={col.serie_id} className="text-center whitespace-nowrap">
                  {col.serie_nome}
                </TableHead>
              ))}
              <TableHead className="text-center font-semibold whitespace-nowrap">TX. GERAL</TableHead>
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
                  <TableCell className="text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                  <TableCell className="font-medium align-top">{linha.escola_nome}</TableCell>
                  {linha.valores_por_serie.map((celula, j) => (
                    <TableCell key={`${linha.escola_id}-${j}`} className="align-top">
                      <CelulaDistribuicaoView celula={celula} compact />
                    </TableCell>
                  ))}
                  <TableCell className="align-top">
                    <CelulaDistribuicaoView celula={linha.taxa_geral_escola} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-muted/50">
              <TableCell />
              <TableCell className="font-semibold align-top">{footerLabel}</TableCell>
              {matriz.medias_da_rede.por_serie.map((celula, j) => (
                <TableCell key={`rede-dist-${j}`} className="align-top">
                  <CelulaDistribuicaoView celula={celula} />
                </TableCell>
              ))}
              <TableCell className="align-top">
                <CelulaDistribuicaoView celula={matriz.medias_da_rede.taxa_geral} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
