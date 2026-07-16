import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardCheck, Pencil } from "lucide-react";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ViewSubjectiveEvaluation = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SubjectiveTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    subjectiveTestApi
      .getById(id)
      .then((detail) => {
        if (active) setData(detail);
      })
      .catch(() => {
        if (active) setError("Avaliação não encontrada.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <p className="text-destructive">{error || "Erro ao carregar."}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/app/avaliacoes-subjetivas")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate("/app/avaliacoes-subjetivas")} className="cursor-pointer">
              Avaliação Subjetiva
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/avaliacoes-subjetivas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{data.title}</h1>
              <Badge variant="outline">{data.test_type === "SIMULADO" ? "Simulado" : "Avaliação"}</Badge>
              {data.status && <Badge variant="secondary">{data.status}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.subject?.name || "—"} · {data.grade?.name || "—"}
              {data.application_date &&
                ` · Aplicação ${new Date(data.application_date + "T12:00:00").toLocaleDateString("pt-BR")}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/app/avaliacoes-subjetivas/${data.id}/editar`)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Editar
          </Button>
          <Button onClick={() => navigate(`/app/avaliacoes-subjetivas/${data.id}/correcao`)}>
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Corrigir
          </Button>
        </div>
      </div>

      {data.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turmas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.classes || []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma turma vinculada.</p>
            )}
            {(data.classes || []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.school?.name || "—"}</p>
                </div>
                {typeof c.students_count === "number" && (
                  <span className="text-xs text-muted-foreground">{c.students_count} alunos</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Questões ({data.questions?.length || data.total_questions || 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.questions || [])
              .slice()
              .sort((a, b) => a.number - b.number)
              .map((q) => (
                <div key={q.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{q.code}</Badge>
                    <span className="text-muted-foreground">#{q.number}</span>
                  </div>
                  <p className="mt-1">{q.skill_description}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ViewSubjectiveEvaluation;
