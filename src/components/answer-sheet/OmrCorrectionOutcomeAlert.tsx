import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, UserX } from 'lucide-react';
import type { OmrCorrectionResult } from '@/types/answer-sheet';
import {
  ALUNO_AUSENTE_LABEL,
  alunoAusenteMessage,
  isAlunoAusente,
} from '@/utils/omrCorrectionResult';

export function OmrCorrectionOutcomeAlert({ result }: { result: OmrCorrectionResult }) {
  if (isAlunoAusente(result)) {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <UserX className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
          >
            {ALUNO_AUSENTE_LABEL}
          </Badge>
        </AlertTitle>
        <AlertDescription>
          {result.student_name ? `${result.student_name}. ` : ''}
          {alunoAusenteMessage(result)}
        </AlertDescription>
      </Alert>
    );
  }

  const pct = typeof result.percentage === 'number' ? result.percentage.toFixed(1) : null;

  return (
    <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
      <AlertTitle>Nota lançada</AlertTitle>
      <AlertDescription>
        {result.student_name || 'Aluno'}
        {result.correct != null && result.total != null
          ? ` — ${result.correct}/${result.total}${pct != null ? ` (${pct}%)` : ''}`
          : ''}
      </AlertDescription>
    </Alert>
  );
}
