import { AlertCircle, ScanLine } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentRanking } from "@/components/evaluations/student/StudentRanking";
import type { RankingResponse } from "@/services/reports/rankingApi";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  errorMessage?: string;
};

export function RankingAnswerSheetPanel({ data, isLoading, errorMessage }: Props) {
  if (isLoading) {
    return (
      <Card className="border border-border/70">
        <CardContent className="py-10 text-sm text-muted-foreground">
          Carregando ranking por cartão-resposta...
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const students = (data?.items || []).map((item) => ({
    id: String(item.student_id || ""),
    nome: String(item.name || ""),
    turma: String(item.class_name || "Sem turma"),
    escola: String(item.school_name || ""),
    serie: String(item.serie || ""),
    nota: Number(item.average_score || 0),
    proficiencia: Number(item.average_proficiency || 0),
    classificacao: String(item.classification || ""),
    status: "concluida" as const,
    posicao: Number(item.position || 0),
  }));

  return (
    <div className="space-y-4">
      <Card className="border border-emerald-200/60 bg-gradient-to-r from-emerald-50/80 to-teal-50/70 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-teal-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              Ranking de cartão-resposta
            </span>
            <Badge variant="secondary">{students.length} alunos</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dados consolidados do gabarito/cartão-resposta selecionado.
          </p>
        </CardHeader>
      </Card>
      {students.length === 0 ? (
        <Card className="border border-dashed border-emerald-200/60 dark:border-emerald-900/40">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhum aluno encontrado para o cartão-resposta e filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <StudentRanking students={students} backendRankingOrder maxStudents={100} />
      )}
    </div>
  );
}
