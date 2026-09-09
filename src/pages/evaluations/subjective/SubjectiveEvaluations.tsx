import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Search } from "lucide-react";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";
import { SubjectiveEvalCard } from "@/components/evaluations/subjective/SubjectiveEvalCard";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "pendente", label: "Rascunho" },
  { id: "em_correcao", label: "Em correção" },
  { id: "concluida", label: "Concluídas" },
] as const;

const SubjectiveEvaluations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<SubjectiveTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const response = await subjectiveTestApi.list({ page: 1, per_page: 100 });
      setItems(response.items);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as avaliações subjetivas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && (item.status || "pendente") !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        item.title,
        item.subject?.name,
        item.grade?.name,
        ...(item.classes || []).map((c) => c.name),
        ...(item.schools || []).map((s) => s.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, statusFilter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await subjectiveTestApi.remove(deleteId);
      toast({ title: "Avaliação excluída" });
      setDeleteId(null);
      await load();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir a avaliação.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Avaliação Subjetiva</h1>
          <p className="text-sm text-muted-foreground">
            Provas impressas com correção manual por marcações e pesos configuráveis.
          </p>
        </div>
        <Button onClick={() => navigate("/app/avaliacoes-subjetivas/nova")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova avaliação
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por título, disciplina ou turma"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={statusFilter === f.id ? "default" : "outline"}
              className={cn("rounded-full", statusFilter === f.id && "shadow-sm")}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "Nenhuma avaliação subjetiva cadastrada."
                : "Nenhuma avaliação neste filtro."}
            </p>
            {items.length === 0 && (
              <Button onClick={() => navigate("/app/avaliacoes-subjetivas/nova")}>Criar a primeira</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <SubjectiveEvalCard key={item.id} item={item} onDelete={setDeleteId} />
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir avaliação subjetiva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A avaliação e seus lançamentos serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubjectiveEvaluations;
