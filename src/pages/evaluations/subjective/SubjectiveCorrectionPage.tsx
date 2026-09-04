import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, School, Users } from "lucide-react";
import { SubjectiveStatusBadge } from "@/components/evaluations/subjective/SubjectiveStatusBadge";
import { Progress } from "@/components/ui/progress";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import SubjectiveCorrectionMatrix from "@/components/evaluations/subjective/SubjectiveCorrectionMatrix";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";

const SubjectiveCorrectionPage = () => {
  const { id, classId } = useParams<{ id: string; classId?: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<SubjectiveTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    subjectiveTestApi
      .getById(id)
      .then((detail) => {
        if (active) setTest(detail);
      })
      .catch((err) => {
        console.error(err);
        if (active) {
          setError(err?.response?.status === 404 ? "Avaliação não encontrada." : "Não foi possível carregar a avaliação.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!id) return null;

  if (loading) {
    return (
      <div className="container mx-auto space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="container mx-auto px-4 py-6">
        <p className="text-destructive">{error || "Erro ao carregar."}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/app/avaliacoes-subjetivas")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 px-2 py-4 md:px-4 md:py-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate("/app/avaliacoes-subjetivas")} className="cursor-pointer">
              Avaliação Subjetiva
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => navigate(`/app/avaliacoes-subjetivas/${id}`)}
              className="cursor-pointer"
            >
              {test.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Correção</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            navigate(classId ? `/app/avaliacoes-subjetivas/${id}/correcao` : `/app/avaliacoes-subjetivas/${id}`)
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Correção — {test.title}</h1>
          <p className="text-sm text-muted-foreground">
            Lance as marcações de cada aluno na grade. Turmas concluídas aparecem com o selo verde.
          </p>
        </div>
      </div>

      {classId ? (
        <SubjectiveCorrectionMatrix
          testId={id}
          classId={classId}
          municipalityName={test.municipalities?.[0]?.name}
          municipalityId={test.municipalities?.[0]?.id}
          schoolName={test.schools?.[0]?.name}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
            {(test.class_progress || test.classes || []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma turma vinculada a esta avaliação.
              </CardContent>
            </Card>
          ) : (
            {(test.class_progress || test.classes || []).map((cls) => {
              const progress = "status" in cls ? cls : undefined;
              return (
              <Card
                key={cls.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/app/avaliacoes-subjetivas/${id}/correcao/${cls.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>{cls.name}</span>
                    <div className="flex items-center gap-2">
                      <SubjectiveStatusBadge status={progress?.status || "pendente"} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <School className="h-4 w-4" />
                      {("school" in cls && cls.school?.name) || "Escola não informada"}
                    </span>
                    {typeof cls.students_count === "number" && (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {cls.students_count} alunos
                      </span>
                    )}
                  </div>
                  {typeof progress?.pct === "number" && (
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span>Marcações lançadas</span>
                        <span>
                          {progress.filled_cells}/{progress.expected_cells} ({progress.pct}%)
                        </span>
                      </div>
                      <Progress value={progress.pct} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectiveCorrectionPage;
