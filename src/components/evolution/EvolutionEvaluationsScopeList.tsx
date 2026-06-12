import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, GraduationCap, Users } from 'lucide-react';
import type { EvaluationInfo } from '@/services/evaluation/evaluationComparisonApi';
import {
  formatEvaluationClassNames,
  formatEvaluationGradeNames,
  formatEvaluationScopeDate,
  sortEvaluationsByOrder,
  type EvaluationScopeLike,
} from '@/utils/evolution/evaluationScopeLabels';

export function EvolutionScopeMetaLines({ evaluation }: { evaluation: EvaluationScopeLike }) {
  const grades = formatEvaluationGradeNames(evaluation);
  const classes = formatEvaluationClassNames(evaluation);
  if (!grades && !classes) return null;

  return (
    <div className="text-xs text-muted-foreground space-y-0.5 mt-1.5">
      {grades ? <p>Série: {grades}</p> : null}
      <p>Turmas: {classes || '—'}</p>
    </div>
  );
}

type Props = {
  evaluations: EvaluationInfo[];
  /** Rótulo do instrumento (avaliação ou gabarito). */
  instrumentLabel?: string;
  variant?: 'screen' | 'pdf';
};

function ScopeRow({
  evaluation,
  index,
  variant,
}: {
  evaluation: EvaluationInfo;
  index: number;
  variant: 'screen' | 'pdf';
}) {
  const grades = formatEvaluationGradeNames(evaluation);
  const classes = formatEvaluationClassNames(evaluation);
  const dateLabel = formatEvaluationScopeDate(evaluation.application_date ?? evaluation.created_at);

  if (variant === 'pdf') {
    return (
      <div
        style={{
          padding: '10px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
          marginBottom: '8px',
          pageBreakInside: 'avoid',
        }}
      >
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}>
          {index + 1}. {evaluation.title}
        </div>
        {dateLabel ? (
          <div style={{ fontSize: '8px', color: '#6b7280', marginBottom: '4px' }}>Aplicação: {dateLabel}</div>
        ) : null}
        <div style={{ fontSize: '8px', color: '#374151', marginBottom: '2px' }}>
          <strong>Série:</strong> {grades || '—'}
        </div>
        <div style={{ fontSize: '8px', color: '#374151' }}>
          <strong>Turmas:</strong> {classes || '—'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-semibold text-sm text-foreground leading-tight">{evaluation.title}</p>
          {dateLabel ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              {dateLabel}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <GraduationCap className="h-3 w-3 shrink-0" />
              Série:
            </span>
            {grades ? (
              <Badge variant="secondary" className="text-xs font-normal">
                {grades}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground shrink-0 pt-0.5">
              <Users className="h-3 w-3 shrink-0" />
              Turmas:
            </span>
            {classes ? (
              <span className="text-foreground">{classes}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EvolutionEvaluationsScopeList({
  evaluations,
  instrumentLabel = 'avaliações',
  variant = 'screen',
}: Props) {
  const sorted = sortEvaluationsByOrder(evaluations);
  if (sorted.length === 0) return null;

  if (variant === 'pdf') {
    return (
      <div data-pdf-section="evaluations-scope" style={{ marginBottom: '18px', pageBreakInside: 'avoid' }}>
        <h2
          style={{
            fontSize: '13px',
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#1f2937',
            marginTop: '0',
          }}
        >
          Séries e turmas das {instrumentLabel}
        </h2>
        {sorted.map((evaluation, index) => (
          <ScopeRow key={evaluation.id} evaluation={evaluation} index={index} variant="pdf" />
        ))}
      </div>
    );
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          Séries e turmas das {instrumentLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((evaluation, index) => (
          <ScopeRow key={evaluation.id} evaluation={evaluation} index={index} variant="screen" />
        ))}
      </CardContent>
    </Card>
  );
}
