import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, School, Users, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import SubjectiveCorrectionMatrix from "@/components/evaluations/subjective/SubjectiveCorrectionMatrix";

interface EvaluationClassItem {
  id: string;
  name: string;
  school_name: string;
  grade_name: string;
  students_count: number;
  class_test_id: string | null;
  status: "applied" | "configured";
}

interface EvaluationSummary {
  id: string;
  title: string;
  evaluation_mode?: string;
}

const SubjectiveCorrection = () => {
  const { id, classId } = useParams<{ id: string; classId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<EvaluationSummary | null>(null);
  const [classes, setClasses] = useState<EvaluationClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const evalResponse = await api.get(`/test/${id}`);
        const evaluationData = evalResponse.data;
        if (!active) return;

        if (evaluationData.evaluation_mode !== "subjective") {
          setError("Esta avaliação não é do tipo subjetiva (correção manual por rubrica).");
          setEvaluation({ id, title: evaluationData.title, evaluation_mode: evaluationData.evaluation_mode });
          setLoading(false);
          return;
        }

        setEvaluation({ id, title: evaluationData.title, evaluation_mode: evaluationData.evaluation_mode });

        if (!classId) {
          const classesResponse = await api.get(`/test/${id}/classes`);
          if (!active) return;
          const mapped: EvaluationClassItem[] = Array.isArray(classesResponse.data)
            ? classesResponse.data.map((item: any) => ({
                id: item.class?.id,
                name: item.class?.name || "Turma",
                school_name: item.class?.school?.name || "Escola não informada",
                grade_name: item.class?.grade?.name || "Série não informada",
                students_count: item.students_count || 0,
                class_test_id: item.class_test_id || null,
                status: (item.status || "configured") as "applied" | "configured",
              }))
            : [];
          setClasses(mapped);
        }
      } catch (err: any) {
        console.error("Erro ao carregar avaliação subjetiva:", err);
        if (active) {
          setError(
            err?.response?.status === 404
              ? "Avaliação não encontrada."
              : "Não foi possível carregar os dados da avaliação."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [id, classId, toast]);

  if (!id) return null;

  return (
    <div className="container mx-auto px-2 md:px-4 py-4 md:py-6 space-y-6">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate("/app/avaliacoes")} className="cursor-pointer">
                Avaliações
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate(`/app/avaliacao/${id}`)} className="cursor-pointer">
                {evaluation?.title || "Avaliação"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Correção subjetiva</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(classId ? `/app/avaliacao/${id}/correcao-subjetiva` : `/app/avaliacao/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        <h1 className="text-xl md:text-2xl font-bold dark:text-gray-100 mt-2">
          Correção da Avaliação Subjetiva
        </h1>
        <p className="text-muted-foreground">
          {evaluation?.title || "Carregando..."}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : classId ? (
        <SubjectiveCorrectionMatrix testId={id} classId={classId} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Selecione a turma que deseja corrigir:</p>
          {classes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma turma aplicada foi encontrada para esta avaliação. Aplique a avaliação a uma turma primeiro.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => (
                <Card
                  key={cls.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/app/avaliacao/${id}/correcao-subjetiva/${cls.id}`)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <School className="h-4 w-4 text-muted-foreground" />
                        {cls.name}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>{cls.school_name}</p>
                    <p>{cls.grade_name}</p>
                    <p className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {cls.students_count} aluno(s)
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectiveCorrection;
