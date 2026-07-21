import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { ClipboardCheck, Eye, PencilRuler } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPORT_TAG_BASE } from "@/utils/report/reportTagStyles";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";

function getTypeColor(type: string) {
  switch (type?.toUpperCase()) {
    case "AVALIACAO":
      return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-blue-500 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/55 dark:text-blue-200 dark:hover:bg-blue-900/70`;
    case "SIMULADO":
      return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-emerald-500 bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/55 dark:text-green-200 dark:hover:bg-green-900/70`;
    default:
      return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-border bg-muted text-foreground hover:bg-muted/80 dark:bg-muted/60 dark:hover:bg-muted/80`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Entrada do menu Corrigir: lista avaliações subjetivas para lançar a rubrica.
 */
const SubjectiveCorrectionHub = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SubjectiveTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    subjectiveTestApi
      .list({ page: 1, per_page: 100 })
      .then((res) => {
        if (active) setItems(res.items);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as avaliações.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Correção</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma avaliação subjetiva para lançar as respostas dos alunos (SIM / PARCIAL / NÃO / BRANCO).
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-[75%]" />
                <Skeleton className="h-3 w-full" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-6 w-1/2" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PencilRuler className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma avaliação subjetiva para corrigir.</p>
            <Button onClick={() => navigate("/app/avaliacoes-subjetivas/nova")}>Criar avaliação</Button>
          </CardContent>
        </Card>
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          role="list"
        >
          {items.map((item) => {
            const questionCount =
              typeof item.total_questions === "number"
                ? item.total_questions
                : item.questions?.length ?? 0;
            const typeLabel = item.test_type === "SIMULADO" ? "Simulado" : "Avaliação";

            return (
              <li key={item.id}>
                <Card className="flex h-full flex-col overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="line-clamp-2 text-base font-semibold leading-tight">
                        {item.title}
                      </h3>
                      {item.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.subject ? (
                        <DisciplineTag
                          subjectId={item.subject.id}
                          name={item.subject.name}
                          className="text-xs"
                        />
                      ) : (
                        <Badge variant="secondary" className="text-xs text-muted-foreground">
                          Sem disciplina
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs tabular-nums border-border bg-muted/20 dark:bg-muted/40"
                      >
                        {new Intl.NumberFormat("pt-BR").format(questionCount)} questões
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", getTypeColor(item.test_type))}
                      >
                        {typeLabel}
                      </Badge>
                      {item.grade ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-border bg-muted/20 dark:bg-muted/40"
                        >
                          {item.grade.name}
                        </Badge>
                      ) : null}
                      {item.classes && item.classes.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-border bg-muted/20 dark:bg-muted/40"
                        >
                          {item.classes.length} turma(s)
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground/80">Criador: </span>
                        {item.createdBy?.name ?? "—"}
                      </div>
                      <div className="grid gap-0.5">
                        <div>
                          <span className="font-medium text-foreground/80">Criada em: </span>
                          {formatDate(item.createdAt)}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">Aplicada em: </span>
                          {formatDate(item.application_date)}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardFooter className="mt-auto border-t bg-muted/20 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className="w-fit gap-2 px-2 py-2 text-sm whitespace-nowrap bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                        onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/correcao`)}
                      >
                        <ClipboardCheck className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">Abrir correção</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-9 w-9 shrink-0 px-0 sm:w-9"
                        onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}`)}
                        aria-label={`Ver avaliação: ${item.title}`}
                        title="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SubjectiveCorrectionHub;
