import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Eye, Pencil, Trash2 } from "lucide-react";
import type { SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";
import { SubjectiveStatusBadge } from "@/components/evaluations/subjective/SubjectiveStatusBadge";
import { cn } from "@/lib/utils";

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

export function SubjectiveEvalCard({
  item,
  onDelete,
}: {
  item: SubjectiveTest;
  onDelete?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const questionCount =
    typeof item.total_questions === "number" ? item.total_questions : item.questions?.length ?? 0;
  const concluded = item.correction_summary?.concluded_classes ?? 0;
  const totalClasses = item.correction_summary?.total_classes ?? item.classes?.length ?? 0;

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-semibold leading-tight">{item.title}</h3>
          <SubjectiveStatusBadge status={item.status} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.subject?.name && (
            <Badge variant="secondary" className="text-xs">
              {item.subject.name}
            </Badge>
          )}
          {item.grade?.name && (
            <Badge variant="outline" className="text-xs">
              {item.grade.name}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {item.test_type === "SIMULADO" ? "Simulado" : "Avaliação"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(item.schools || []).slice(0, 2).map((s) => (
            <span
              key={s.id}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {s.name}
            </span>
          ))}
          {(item.schools || []).length > 2 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              +{(item.schools || []).length - 2} escolas
            </span>
          )}
          {totalClasses > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {concluded}/{totalClasses} turmas concluídas
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-1 text-xs text-muted-foreground">
        <p>
          {questionCount} questão(ões)
          {formatDate(item.application_date) ? ` · Aplicação ${formatDate(item.application_date)}` : ""}
        </p>
        {item.description ? <p className="line-clamp-2">{item.description}</p> : null}
      </CardContent>
      <CardFooter className={cn("flex flex-wrap gap-2 border-t bg-muted/20 pt-4")}>
        <Button size="sm" variant="outline" onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}`)}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          Ver
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/editar`)}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
        <Button size="sm" onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/correcao`)}>
          <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
          Corrigir
        </Button>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default SubjectiveEvalCard;
