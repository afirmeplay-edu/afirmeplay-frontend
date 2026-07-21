import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ClipboardCheck, Eye, Pencil, Plus, Trash2, BookOpen } from "lucide-react";
import { subjectiveTestApi, type SubjectiveTest } from "@/services/evaluation/subjectiveTestApi";

const SubjectiveEvaluations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<SubjectiveTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await subjectiveTestApi.list({ page: 1, per_page: 50 });
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
            Avaliações impressas com correção manual por rubrica (SIM / PARCIAL / NÃO / BRANCO).
          </p>
        </div>
        <Button onClick={() => navigate("/app/avaliacoes-subjetivas/nova")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova avaliação
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma avaliação subjetiva cadastrada.</p>
            <Button onClick={() => navigate("/app/avaliacoes-subjetivas/nova")}>Criar a primeira</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
                  <Badge variant="outline">{item.test_type === "SIMULADO" ? "Simulado" : "Avaliação"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.subject?.name || "—"} · {item.grade?.name || "—"}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {item.application_date && (
                    <span>
                      Aplicação:{" "}
                      {new Date(item.application_date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  {typeof item.total_questions === "number" && (
                    <span>· {item.total_questions} questão(ões)</span>
                  )}
                  {item.status && <Badge variant="secondary">{item.status}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}`)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/editar`)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/app/avaliacoes-subjetivas/${item.id}/correcao`)}
                  >
                    <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                    Corrigir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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
