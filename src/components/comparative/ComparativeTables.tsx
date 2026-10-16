import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  COMPARATIVE_NIVEL_LABELS,
  type ComparativeIndicador,
} from '@/constants/comparativeReport';
import type { ComparativeResumo } from '@/services/reports/comparativeReportApi';
import { labelResultadosAlunosFiltro } from '@/constants/resultadosAlunosFiltro';

function fmtInt(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

function fmtDec(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(value: number | null | undefined): string {
  return `${fmtDec(value, 2)}%`;
}

type Props = {
  report: ComparativeResumo;
};

export function ComparativeTables({ report }: Props) {
  const selected = new Set(report.filtros_aplicados.indicadores as ComparativeIndicador[]);
  const headers = report.avaliacoes.map((a) => a.titulo || a.evaluation_id);

  return (
    <div className="space-y-6" data-pdf-section="tables">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Município:</span>{' '}
          {report.filtros_aplicados.municipio.nome}
        </div>
        <div>
          <span className="font-medium text-foreground">Alunos:</span>{' '}
          {labelResultadosAlunosFiltro(report.filtros_aplicados.alunos)}
        </div>
      </div>

      {selected.has('participacao') && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Participação</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Esperados</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtInt(a.indicadores.participacao?.esperados)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>Avaliados</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtInt(a.indicadores.participacao?.avaliados)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>% Comparecimento</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtPct(a.indicadores.participacao?.percentual_comparecimento)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      )}

      {selected.has('proficiencia_media') && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Proficiência média</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escopo</TableHead>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Geral</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtDec(a.indicadores.proficiencia_media?.geral)}
                  </TableCell>
                ))}
              </TableRow>
              {Array.from(
                new Set(
                  report.avaliacoes.flatMap((a) =>
                    (a.indicadores.proficiencia_media?.por_disciplina || []).map(
                      (d) => d.disciplina || ''
                    )
                  )
                )
              )
                .filter(Boolean)
                .map((disciplina) => (
                  <TableRow key={disciplina}>
                    <TableCell>{disciplina}</TableCell>
                    {report.avaliacoes.map((a) => {
                      const row = (a.indicadores.proficiencia_media?.por_disciplina || []).find(
                        (d) => d.disciplina === disciplina
                      );
                      return (
                        <TableCell key={a.evaluation_id}>
                          {fmtDec(row?.media_proficiencia)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </section>
      )}

      {selected.has('distribuicao_niveis') && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Distribuição por nível</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nível</TableHead>
                {headers.map((h) => (
                  <TableHead key={`${h}-q`}>Qtd — {h}</TableHead>
                ))}
                {headers.map((h) => (
                  <TableHead key={`${h}-p`}>% — {h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(COMPARATIVE_NIVEL_LABELS).map((nivel) => (
                <TableRow key={nivel}>
                  <TableCell>{COMPARATIVE_NIVEL_LABELS[nivel]}</TableCell>
                  {report.avaliacoes.map((a) => (
                    <TableCell key={`${a.evaluation_id}-q`}>
                      {fmtInt(a.indicadores.distribuicao_niveis?.quantidades?.[nivel])}
                    </TableCell>
                  ))}
                  {report.avaliacoes.map((a) => (
                    <TableCell key={`${a.evaluation_id}-p`}>
                      {fmtPct(a.indicadores.distribuicao_niveis?.percentuais?.[nivel])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {selected.has('alunos_avaliados') && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Nº de alunos avaliados</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Alunos avaliados</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtInt(a.indicadores.alunos_avaliados?.quantidade)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      )}

      {selected.has('aplicacoes') && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Nº de aplicações</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Aplicações (ClassTest)</TableCell>
                {report.avaliacoes.map((a) => (
                  <TableCell key={a.evaluation_id}>
                    {fmtInt(a.indicadores.aplicacoes?.quantidade)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
