import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, UserX } from 'lucide-react';
import type { OmrCorrectionFailure, OmrCorrectionResult } from '@/types/answer-sheet';
import {
  ALUNO_AUSENTE_LABEL,
  alunoAusenteMessage,
  formatOmrCount,
  formatOmrPercentage,
  isAlunoAusente,
  omrCorrectionStudentLabel,
  omrScoreValue,
} from '@/utils/omrCorrectionResult';

function OutcomeStats({
  result,
  tone,
}: {
  result: OmrCorrectionResult;
  tone: 'success' | 'absent';
}) {
  const labelClass =
    tone === 'absent'
      ? 'text-xs font-medium text-amber-800 dark:text-amber-200'
      : 'text-xs font-medium text-green-800 dark:text-green-200';
  const valueClass =
    tone === 'absent'
      ? 'text-sm font-semibold text-amber-950 dark:text-amber-50'
      : 'text-sm font-semibold text-green-950 dark:text-green-50';

  const score = tone === 'absent' ? null : formatOmrPercentage(omrScoreValue(result));
  const stats = [
    { label: 'Acertos', value: formatOmrCount(result.correct) },
    { label: 'Errados', value: formatOmrCount(result.wrong) },
    { label: 'Inválidos', value: formatOmrCount(result.invalid) },
    { label: 'Nota', value: score },
  ].filter((stat): stat is { label: string; value: string } => stat.value != null);

  if (stats.length === 0) return null;

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <dt className={labelClass}>{stat.label}</dt>
          <dd className={valueClass}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OmrCorrectionFailureAlert({ failure }: { failure: OmrCorrectionFailure }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{omrCorrectionStudentLabel(failure.studentName)}</AlertTitle>
      <AlertDescription className="break-words">{failure.message}</AlertDescription>
    </Alert>
  );
}

export function OmrCorrectionOutcomeAlert({ result }: { result: OmrCorrectionResult }) {
  const absent = isAlunoAusente(result);
  const studentName = omrCorrectionStudentLabel(result.student_name);

  if (absent) {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <UserX className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertTitle className="flex flex-wrap items-center gap-2 text-amber-950 dark:text-amber-50">
          <span className="min-w-0 break-words">{studentName}</span>
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
          >
            {ALUNO_AUSENTE_LABEL}
          </Badge>
        </AlertTitle>
        <AlertDescription>
          <p>{alunoAusenteMessage(result)}</p>
          <OutcomeStats result={result} tone="absent" />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
      <CheckCircle className="h-4 w-4 text-green-700 dark:text-green-400" />
      <AlertTitle className="text-green-950 dark:text-green-50">{studentName}</AlertTitle>
      <AlertDescription>
        <OutcomeStats result={result} tone="success" />
      </AlertDescription>
    </Alert>
  );
}
