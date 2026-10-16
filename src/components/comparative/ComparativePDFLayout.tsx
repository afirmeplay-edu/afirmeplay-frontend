import { ComparativeCharts } from '@/components/comparative/ComparativeCharts';
import { ComparativeTables } from '@/components/comparative/ComparativeTables';
import { labelResultadosAlunosFiltro } from '@/constants/resultadosAlunosFiltro';
import type { ComparativeResumo } from '@/services/reports/comparativeReportApi';

export type ComparativePDFLayoutProps = {
  report: ComparativeResumo;
  generatedAt: string;
  escolaNome?: string;
  serieNome?: string;
  turmaNome?: string;
};

export function ComparativePDFLayout({
  report,
  generatedAt,
  escolaNome,
  serieNome,
  turmaNome,
}: ComparativePDFLayoutProps) {
  const filtros = report.filtros_aplicados;

  return (
    <div
      className="bg-white text-slate-900"
      style={{ width: 800, padding: 24, fontFamily: 'Arial, sans-serif' }}
      data-comparative-pdf-root="1"
    >
      <section data-pdf-section="cover" className="space-y-3 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Relatório Comparativo</h1>
        <p className="text-sm text-slate-600">Comparativo descritivo entre avaliações (sem variação)</p>
        <div className="grid gap-1 text-sm text-slate-700">
          <div>
            <strong>Município:</strong> {filtros.municipio.nome}
          </div>
          <div>
            <strong>Avaliações:</strong>{' '}
            {report.avaliacoes.map((a) => a.titulo).join(' | ')}
          </div>
          <div>
            <strong>Alunos:</strong> {labelResultadosAlunosFiltro(filtros.alunos)}
          </div>
          {escolaNome && (
            <div>
              <strong>Escola:</strong> {escolaNome}
            </div>
          )}
          {serieNome && (
            <div>
              <strong>Série:</strong> {serieNome}
            </div>
          )}
          {turmaNome && (
            <div>
              <strong>Turma:</strong> {turmaNome}
            </div>
          )}
          <div>
            <strong>Gerado em:</strong> {generatedAt}
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-4" data-pdf-section="tables-block">
        <ComparativeTables report={report} />
      </section>

      <section className="mt-6 space-y-4" data-pdf-section="charts-block">
        <ComparativeCharts report={report} mode="pdf" />
      </section>
    </div>
  );
}
