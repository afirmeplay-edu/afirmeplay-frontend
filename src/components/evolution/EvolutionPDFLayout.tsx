import type { ProcessedEvolutionData } from './EvolutionCharts';
import type { ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionComboChart } from '@/components/evolution/EvolutionComboChart';
import {
  getEvolutionColorByIndex,
  getEvolutionProficiencyColorByIndex,
  getLevelColor,
  getProficiencyDomain,
  getSubjectColors,
  EVOLUTION_DELTA_COLORS,
  EVOLUTION_LINE_COLOR,
} from '@/utils/evolution/evolutionChartColors';
import {
  formatEvolutionMetric,
  formatSignedEvolutionPercent,
} from '@/utils/evolution/formatEvolutionMetric';
import {
  mergeEvolutionRows,
  readEvolutionComboSeries,
  readGeneralGradeStats,
  rowHasAllEvaluations,
  type EvolutionComboSeries,
} from '@/utils/evolution/evolutionSeries';

export interface EvolutionPDFLayoutProps {
  processedData: ProcessedEvolutionData;
  comparisonData: ComparisonResponse | null;
  evaluationNames: string[];
  reportKind?: 'aggregate' | 'student';
  studentLabel?: {
    name: string;
    school?: string;
    grade?: string;
    class?: string;
  };
}

const chartBoxStyle = {
  width: 720,
  height: 260,
} as const;

function PdfMetricChart({
  title,
  metric,
  series,
  yDomain,
  yAxisName,
  seriesName,
}: {
  title: string;
  metric: 'nota' | 'proficiencia' | 'quantidade';
  series: EvolutionComboSeries;
  yDomain?: [number, number];
  yAxisName?: string;
  seriesName: string;
}) {
  if (series.values.length === 0) return null;
  return (
    <div style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
      <h3 style={{ fontSize: 11, fontWeight: 'bold', margin: '0 0 6px', color: '#374151', lineHeight: 1.2 }}>
        {title}
      </h3>
      <div style={chartBoxStyle}>
        <EvolutionComboChart
          mode="pdf"
          metric={metric}
          evaluationNames={series.evaluationNames}
          values={series.values}
          variations={series.variations}
          colors={series.colors}
          yDomain={yDomain}
          yAxisName={yAxisName}
          seriesName={seriesName}
        />
      </div>
      <div
        style={{
          marginTop: 8,
          padding: '8px 12px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 4,
          fontSize: 9,
          color: '#374151',
          lineHeight: 1.5,
        }}
      >
        <span style={{ marginRight: 12 }}>
          <strong>Barras e linha:</strong> {seriesName} em cada avaliação (linha {EVOLUTION_LINE_COLOR})
        </span>
        <span style={{ color: EVOLUTION_DELTA_COLORS.up, fontWeight: 700, marginRight: 8 }}>+X%</span>
        <span style={{ marginRight: 12 }}>alta</span>
        <span style={{ color: EVOLUTION_DELTA_COLORS.down, fontWeight: 700, marginRight: 8 }}>−X%</span>
        <span style={{ marginRight: 12 }}>queda</span>
        <span style={{ color: EVOLUTION_DELTA_COLORS.flat, fontWeight: 700, marginRight: 8 }}>0,0%</span>
        <span>estável</span>
      </div>
    </div>
  );
}

export const EvolutionPDFLayout = ({
  processedData,
  comparisonData,
  evaluationNames,
  reportKind = 'aggregate',
  studentLabel,
}: EvolutionPDFLayoutProps) => {
  const isStudentReport = reportKind === 'student';
  const generalStats = readGeneralGradeStats(processedData.generalData || []);
  const generalNota = readEvolutionComboSeries(
    mergeEvolutionRows(processedData.generalData || [])[0],
    evaluationNames,
    getEvolutionColorByIndex
  );
  const generalProf = readEvolutionComboSeries(
    mergeEvolutionRows(processedData.proficiencyData || [])[0],
    evaluationNames,
    getEvolutionProficiencyColorByIndex
  );

  const subjects = Object.entries(processedData.subjectData || {}).filter(([, rows]) =>
    rowHasAllEvaluations(mergeEvolutionRows(rows)[0], evaluationNames.length)
  );
  const levels = Object.entries(processedData.levelsData || {}).filter(([, rows]) =>
    rowHasAllEvaluations(mergeEvolutionRows(rows)[0], evaluationNames.length)
  );

  const variationColor =
    generalStats?.variacaoTotal == null
      ? '#1f2937'
      : generalStats.variacaoTotal > 0
        ? '#10b981'
        : generalStats.variacaoTotal < 0
          ? '#ef4444'
          : '#1f2937';

  return (
    <div
      className="evolution-pdf-layout"
      style={{
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: '#ffffff',
        padding: 0,
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000000',
        boxSizing: 'border-box',
      }}
    >
      <div
        data-pdf-section="header"
        style={{ marginBottom: 20, marginTop: '15mm', textAlign: 'center', borderBottom: '2px solid #2563eb', paddingBottom: 12 }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#2563eb', marginBottom: 8, marginTop: 0 }}>
          {isStudentReport ? 'EVOLUÇÃO INDIVIDUAL DO ALUNO' : 'ANÁLISE DE EVOLUÇÃO'}
        </h1>
        {isStudentReport && studentLabel?.name && (
          <p style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937', margin: '0 0 6px 0' }}>{studentLabel.name}</p>
        )}
        {isStudentReport && (studentLabel?.school || studentLabel?.class || studentLabel?.grade) && (
          <p style={{ fontSize: 10, color: '#4b5563', margin: '0 0 8px 0' }}>
            {[studentLabel?.school, studentLabel?.grade && `Série ${studentLabel.grade}`, studentLabel?.class && `Turma ${studentLabel.class}`]
              .filter(Boolean)
              .join(' • ')}
          </p>
        )}
        <p style={{ fontSize: 10, color: '#666666', margin: 0 }}>{evaluationNames.join(' • ')}</p>
      </div>

      {isStudentReport && comparisonData?.comparisons && comparisonData.comparisons.length > 0 && (
        <div data-pdf-section="student-comparisons" style={{ marginBottom: 18, pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 10, color: '#1f2937', marginTop: 0 }}>
            Comparações entre avaliações (nota e proficiência)
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, color: '#1f2937' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>De → Para</th>
                <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>Nota (1ª → 2ª)</th>
                <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>Proficiência (1ª → 2ª)</th>
                <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>Variação nota</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.comparisons.map((comp, idx) => {
                const gen = comp.general_comparison;
                const pctN = gen?.average_grade?.evolution?.percentage;
                return (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>
                      {comp.from_evaluation?.title ?? '—'} → {comp.to_evaluation?.title ?? '—'}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>
                      {formatEvolutionMetric(gen?.average_grade?.evaluation_1, 'nota')} →{' '}
                      {formatEvolutionMetric(gen?.average_grade?.evaluation_2, 'nota')}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>
                      {formatEvolutionMetric(gen?.average_proficiency?.evaluation_1, 'proficiencia')} →{' '}
                      {formatEvolutionMetric(gen?.average_proficiency?.evaluation_2, 'proficiencia')}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>
                      {formatSignedEvolutionPercent(pctN)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {generalStats && (
        <div data-pdf-section="summary" style={{ marginBottom: 18, pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 10, color: '#1f2937', marginTop: 0 }}>
            Resumo Estatístico
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 15 }}>
            <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>Média Geral</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>
                {formatEvolutionMetric(generalStats.media, 'nota')}
              </div>
              <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>pontos</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>Variação</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: variationColor }}>
                {formatSignedEvolutionPercent(generalStats.variacaoTotal)}
              </div>
              <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>período</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>Total de Avaliações</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>{generalStats.totalAvaliacoes}</div>
              <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>avaliações</div>
            </div>
          </div>
        </div>
      )}

      <div data-pdf-section="general-charts" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 12, color: '#1f2937', marginTop: 0 }}>
          Gráficos Gerais
        </h2>
        <PdfMetricChart title="Nota Geral" metric="nota" series={generalNota} yDomain={[0, 10]} seriesName="Nota" />
        <PdfMetricChart
          title="Proficiência Geral"
          metric="proficiencia"
          series={generalProf}
          yDomain={[0, 425]}
          yAxisName="Proficiência"
          seriesName="Proficiência"
        />
      </div>

      {subjects.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 12, color: '#1f2937', marginTop: 0 }}>
            Gráficos por Disciplina
          </h2>
          {subjects.map(([subject, rows], subjectIndex) => {
            const subjectColors = getSubjectColors(subject, subjectIndex);
            const colorAt = (index: number) => subjectColors.palette[index % subjectColors.palette.length];
            const notaSeries = readEvolutionComboSeries(mergeEvolutionRows(rows)[0], evaluationNames, colorAt);
            const profRows = processedData.subjectProficiencyData[subject] || [];
            const profMerged = mergeEvolutionRows(profRows);
            const profSeries = rowHasAllEvaluations(profMerged[0], evaluationNames.length)
              ? readEvolutionComboSeries(profMerged[0], evaluationNames, colorAt)
              : null;
            return (
              <div key={subject} data-pdf-section={`subject-${subject.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                <h3 style={{ fontSize: 12, fontWeight: 'bold', color: '#1f2937', margin: '8px 0' }}>{subject}</h3>
                <PdfMetricChart title={`Notas - ${subject}`} metric="nota" series={notaSeries} yDomain={[0, 10]} seriesName="Nota" />
                {profSeries && (
                  <PdfMetricChart
                    title={`Proficiência - ${subject}`}
                    metric="proficiencia"
                    series={profSeries}
                    yDomain={getProficiencyDomain(subject)}
                    yAxisName="Proficiência"
                    seriesName="Proficiência"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {levels.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 12, color: '#1f2937', marginTop: 0 }}>
            Níveis de Proficiência
          </h2>
          {levels.map(([levelName, rows]) => {
            const levelColor = getLevelColor(levelName);
            const series = readEvolutionComboSeries(
              mergeEvolutionRows(rows)[0],
              evaluationNames,
              () => levelColor
            );
            return (
              <div key={levelName} data-pdf-section={`level-${levelName.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                <PdfMetricChart
                  title={levelName}
                  metric="quantidade"
                  series={series}
                  yAxisName="Quantidade de Alunos"
                  seriesName="Quantidade de Alunos"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
