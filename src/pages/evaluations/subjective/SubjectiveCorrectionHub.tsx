import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ClipboardCheck, PencilRuler } from "lucide-react";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";

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
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Correção</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma avaliação subjetiva para lançar as respostas dos alunos (SIM / PARCIAL / NÃO / BRANCO).
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
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
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/correcao`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{item.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {item.subject?.name || "—"} · {item.grade?.name || "—"}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">{item.test_type === "SIMULADO" ? "Simulado" : "Avaliação"}</Badge>
                {typeof item.total_questions === "number" && (
                  <Badge variant="secondary">{item.total_questions} questões</Badge>
                )}
                {item.classes && (
                  <Badge variant="secondary">{item.classes.length} turma(s)</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectiveCorrectionHub;
