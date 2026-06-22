import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DistribuicaoProficienciaTables } from '@/components/reports/relatorio-geral/DistribuicaoProficienciaTables';
import { MatrizFrequenciaTable } from '@/components/reports/relatorio-geral/MatrizFrequenciaTable';
import { MatrizMediasTable } from '@/components/reports/relatorio-geral/MatrizMediasTable';
import { MatrizNumericaTable } from '@/components/reports/relatorio-geral/MatrizNumericaTable';
import { AcertosHabilidadeCards } from '@/components/reports/relatorio-geral/AcertosHabilidadeCards';
import {
  RelatorioSectionTitle,
  RelatorioSubsectionTitle,
  RelatorioTableBand,
} from '@/components/reports/relatorio-geral/RelatorioSectionTitle';
import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import {
  getAcertosHabilidadeBloco,
  getMatrizDistribuicao,
  getMatrizNumerica,
} from '@/utils/reports/relatorioConsolidadoDisciplinas';
import {
  getComparativoUiHint,
  getMediasRedeFooterLabel,
} from '@/utils/reports/relatorioConsolidadoComparativo';
import { isDistribuicaoComparativo } from '@/utils/reports/relatorioConsolidadoDistribuicao';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_ACERTOS_HABILIDADE,
  RELATORIO_SECAO_DISTRIBUICAO,
  RELATORIO_SECAO_FREQUENCIA,
  RELATORIO_SECAO_MEDIA_NOTA,
  RELATORIO_SECAO_MEDIA_PROFICIENCIA,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import { pdfRgbToCellStyle } from '@/utils/reports/relatorioConsolidadoWebStyles';
import {
  buildApresentacaoDynamicData,
  buildApresentacaoParagraph1Runs,
  buildApresentacaoParagraph2Runs,
} from '@/services/reports/relatorioConsolidadoPdf/buildApresentacaoData';
import { buildFaixaSeriesSubtitle } from '@/services/reports/relatorioConsolidadoPdf/buildFaixaSeriesSubtitle';
import {
  buildMediasIntroRuns,
  buildMediasSubsectionLabel,
  buildMediasTableBandLabel,
  getMediasPdfDisciplinas,
} from '@/services/reports/relatorioConsolidadoPdf/buildMediasIntroData';
import { FREQUENCIA_PDF_CELL_COLORS } from '@/services/reports/relatorioConsolidadoPdf/frequenciaPdfCellStyles';
import { LEGENDA_PROFICIENCIA_ROWS, PROFICIENCIA_PDF_CELL_COLORS } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';

const OBJETIVO_TEXTO =
  'Diagnosticar o nível de proficiência dos estudantes nas competências e habilidades essenciais, subsidiando o planejamento pedagógico e a tomada de decisões para a melhoria contínua da qualidade do ensino.';

const METODOLOGIA_RUNS = [
  { text: 'A avaliação diagnóstica foi elaborada com base nas competências e habilidades previstas na ' },
  { text: 'Base Nacional Comum Curricular (BNCC)', bold: true },
  {
    text: ' e no currículo municipal, contemplando questões de múltipla escolha que avaliam diferentes níveis de conhecimento.',
  },
] as const;

const INTRO_FREQUENCIA =
  'A participação dos estudantes é um elemento fundamental para a representatividade e a confiabilidade dos resultados. A tabela a seguir apresenta os índices de participação por escola e série/ano escolar, permitindo identificar o engajamento da rede na avaliação diagnóstica.';

const LEGENDA_FREQUENCIA = [
  {
    label: 'Excelente',
    fill: FREQUENCIA_PDF_CELL_COLORS.excelente.fill,
    text: FREQUENCIA_PDF_CELL_COLORS.excelente.text,
    description: 'Participação total (100% dos estudantes).',
  },
  {
    label: 'Regular',
    fill: FREQUENCIA_PDF_CELL_COLORS.regular.fill,
    text: FREQUENCIA_PDF_CELL_COLORS.regular.text,
    description: 'Participação parcial (menos de 100% dos estudantes).',
  },
  {
    label: 'Sem Dados',
    fill: FREQUENCIA_PDF_CELL_COLORS.semDados.fill,
    text: FREQUENCIA_PDF_CELL_COLORS.semDados.text,
    description: 'Nenhuma informação de participação disponível.',
  },
];

type TextRun = { text: string; bold?: boolean };

function TextRuns({ runs, className }: { runs: readonly TextRun[] | TextRun[]; className?: string }) {
  return (
    <p className={className ?? 'text-sm text-muted-foreground leading-relaxed'}>
      {runs.map((run, i) =>
        run.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {run.text}
          </strong>
        ) : (
          <span key={i}>{run.text}</span>
        )
      )}
    </p>
  );
}

function LegendBadge({
  label,
  fill,
  text,
}: {
  label: string;
  fill: [number, number, number];
  text: [number, number, number];
}) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold"
      style={pdfRgbToCellStyle(fill, text)}
    >
      {label}
    </span>
  );
}

function LegendTable({
  title,
  col1,
  col2,
  rows,
}: {
  title: string;
  col1: string;
  col2: string;
  rows: Array<{
    label: string;
    fill: [number, number, number];
    text: [number, number, number];
    description: string;
  }>;
}) {
  return (
    <div className="space-y-2">
      {title ? <h4 className="text-sm font-bold">{title}</h4> : null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary">
              <TableHead className="text-primary-foreground w-40 text-center">{col1}</TableHead>
              <TableHead className="text-primary-foreground text-center">{col2}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-center">
                  <LegendBadge label={row.label} fill={row.fill} text={row.text} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground text-center">{row.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type RelatorioConsolidadoReportSectionsProps = {
  report: RelatorioConsolidado;
  /** Nome da escola quando o recorte não é municipal. */
  escolaNome?: string;
  /** Título customizado da avaliação para aparecer na apresentação. */
  tituloAvaliacao: string;
  onDownloadPdf: () => void;
  generatingPdf: boolean;
};

export function RelatorioConsolidadoReportSections({
  report,
  escolaNome,
  tituloAvaliacao,
  onDownloadPdf,
  generatingPdf,
}: RelatorioConsolidadoReportSectionsProps) {
  const seriesColunas = report.series_colunas ?? [];
  const disciplinas = getMediasPdfDisciplinas(report);
  const faixa = buildFaixaSeriesSubtitle(report);
  const apresentacao = buildApresentacaoDynamicData(report, { escolaNome });
  const freqMatriz = getMatrizNumerica(report.consolidado_frequencia, 'GERAL');
  const footerRedeLabel = getMediasRedeFooterLabel(report);
  const comparativoHint = getComparativoUiHint(report);

  const proficienciaLegendRows = LEGENDA_PROFICIENCIA_ROWS.map((row) => ({
    label: row.label,
    description: row.description,
    fill: PROFICIENCIA_PDF_CELL_COLORS[row.key].fill,
    text: PROFICIENCIA_PDF_CELL_COLORS[row.key].text,
  }));

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onDownloadPdf} disabled={generatingPdf}>
          {generatingPdf ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Gerando PDF…
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Baixar PDF
            </>
          )}
        </Button>
      </div>

      {comparativoHint && (
        <p className="text-sm text-muted-foreground rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 px-3 py-2">
          {comparativoHint}
        </p>
      )}

      <section className="space-y-4">
        <RelatorioSectionTitle title="1. Apresentação" />
        <TextRuns runs={buildApresentacaoParagraph1Runs(tituloAvaliacao)} />
        <TextRuns runs={buildApresentacaoParagraph2Runs(apresentacao)} />
        <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 p-4 space-y-2">
          <h4 className="text-sm font-bold text-primary">1.1. Objetivo do Relatório</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">{OBJETIVO_TEXTO}</p>
        </div>
        <LegendTable
          title="1.2. Legenda de Frequência"
          col1="Classificação"
          col2="Descrição"
          rows={LEGENDA_FREQUENCIA}
        />
      </section>

      <section className="space-y-4">
        <RelatorioSectionTitle title={relatorioSecaoTitle(2, RELATORIO_SECAO_FREQUENCIA)} />
        <RelatorioSubsectionTitle label={`2.1. ${faixa.titulo}`} />
        <p className="text-sm text-muted-foreground leading-relaxed">{INTRO_FREQUENCIA}</p>
        {freqMatriz ? (
          <MatrizFrequenciaTable
            seriesColunas={seriesColunas}
            matriz={freqMatriz}
            footerLabel={footerRedeLabel}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum dado de frequência disponível.</p>
        )}
      </section>

      <section className="space-y-4">
        <RelatorioSectionTitle title="3. Considerações Gerais" />
        <RelatorioSubsectionTitle label="3.1. Metodologia de Avaliação" />
        <TextRuns runs={[...METODOLOGIA_RUNS]} />
        <RelatorioSubsectionTitle label="3.2. Legenda de Proficiência (Escala Saeb)" className="mt-4" />
        <p className="text-sm text-muted-foreground">
          A proficiência média é apresentada na escala Saeb, dividida em quatro níveis:
        </p>
        <LegendTable title="" col1="Nível" col2="Descrição" rows={proficienciaLegendRows} />
      </section>

      <section className="space-y-6">
        {disciplinas.map((disc, idx) => {
          const matriz = getMatrizNumerica(report.consideracoes_gerais.consolidado_medias_nota, disc);
          return (
            <div key={`nota-${disc}`} className="space-y-3">
              {idx === 0 && (
                <>
                  <RelatorioSectionTitle title={relatorioSecaoTitle(4, RELATORIO_SECAO_MEDIA_NOTA)} />
                  <TextRuns runs={buildMediasIntroRuns(report)} />
                </>
              )}
              <RelatorioSubsectionTitle label={buildMediasSubsectionLabel(report, 4, idx + 1, disc)} />
              <RelatorioTableBand label={buildMediasTableBandLabel(disc, 'Médias por Escola')} />
              {matriz ? (
                <MatrizMediasTable
                  seriesColunas={seriesColunas}
                  matriz={matriz}
                  metricKind="nota"
                  disciplina={disc}
                  faixaTitulo={faixa.titulo}
                  footerLabel={footerRedeLabel}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados de nota para esta disciplina.</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-6">
        {disciplinas.map((disc, idx) => {
          const matriz = getMatrizNumerica(
            report.consideracoes_gerais.consolidado_medias_proficiencia,
            disc
          );
          return (
            <div key={`prof-${disc}`} className="space-y-3">
              {idx === 0 && (
                <>
                  <RelatorioSectionTitle title={relatorioSecaoTitle(5, RELATORIO_SECAO_MEDIA_PROFICIENCIA)} />
                  <TextRuns runs={buildMediasIntroRuns(report)} />
                </>
              )}
              <RelatorioSubsectionTitle label={buildMediasSubsectionLabel(report, 5, idx + 1, disc)} />
              <RelatorioTableBand label={buildMediasTableBandLabel(disc, 'Proficiência por Escola')} />
              {matriz ? (
                <MatrizMediasTable
                  seriesColunas={seriesColunas}
                  matriz={matriz}
                  metricKind="proficiencia"
                  disciplina={disc}
                  faixaTitulo={faixa.titulo}
                  footerLabel={footerRedeLabel}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem dados de proficiência para esta disciplina.
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-6">
        {disciplinas.map((disc, idx) => {
          const bloco = getAcertosHabilidadeBloco(
            report.consideracoes_gerais.acertos_por_habilidade,
            disc
          );
          return (
            <div key={`hab-${disc}`} className="space-y-3">
              {idx === 0 && (
                <RelatorioSectionTitle title={relatorioSecaoTitle(6, RELATORIO_SECAO_ACERTOS_HABILIDADE)} />
              )}
              <RelatorioSubsectionTitle
                label={buildMediasSubsectionLabel(report, 6, idx + 1, disc)}
              />
              {comparativoHint && (
                <p className="text-xs text-muted-foreground">
                  Matriz: escola selecionada. Lista de habilidades: agregação municipal.
                </p>
              )}
              {bloco?.matriz ? (
                <>
                  <RelatorioTableBand label={buildMediasTableBandLabel(disc, 'Acertos por Escola')} />
                  <MatrizNumericaTable
                    seriesColunas={seriesColunas}
                    matriz={bloco.matriz}
                    cellFormat="percent"
                    totalColumnLabel="TX. GERAL"
                    footerLabel={footerRedeLabel}
                    colorizeByMeta
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem matriz de acertos.</p>
              )}
              {bloco?.por_serie && bloco.por_serie.length > 0 && disc !== 'GERAL' ? (
                <div className="space-y-6">
                  {bloco.por_serie.map((serieBloco) => (
                    <div key={`hab-serie-${serieBloco.serie_id}`} className="space-y-3">
                      <h4 className="text-sm font-bold text-primary">
                        {serieBloco.serie_nome} — Acertos por Habilidade
                      </h4>
                      {serieBloco.habilidades.length > 0 ? (
                        <AcertosHabilidadeCards habilidades={serieBloco.habilidades} />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma habilidade para esta série.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !bloco?.matriz && disc !== 'GERAL' && (
                  <p className="text-sm text-muted-foreground">Nenhuma habilidade consolidada.</p>
                )
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-6">
        {disciplinas.map((disc, idx) => {
          const distMatriz = getMatrizDistribuicao(report.distribuicao_niveis_proficiencia, disc);
          return (
            <div key={`dist-${disc}`} className="space-y-3">
              {idx === 0 && (
                <RelatorioSectionTitle title={relatorioSecaoTitle(7, RELATORIO_SECAO_DISTRIBUICAO)} />
              )}
              <RelatorioSubsectionTitle
                label={buildMediasSubsectionLabel(report, 7, idx + 1, disc)}
              />
              {distMatriz ? (
                <DistribuicaoProficienciaTables
                  seriesColunas={seriesColunas}
                  matriz={distMatriz}
                  comparativo={isDistribuicaoComparativo(report)}
                  footerRedeLabel={footerRedeLabel}
                  quantitativoSubtitle={`${7}.${idx + 1}.1. Quantitativo de Alunos por Nível`}
                  showRedeNivel={disc === 'GERAL'}
                  redeNivel={distMatriz.medias_da_rede.media_da_rede_nivel}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Sem distribuição para esta disciplina.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
