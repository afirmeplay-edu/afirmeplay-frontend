import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchClassStudentsForFolhaRascunho, type FolhaRascunhoClassStudent } from "@/services/documents/folhaRascunhoApi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  schoolId?: string;
  initialSelectedIds: string[] | null;
  onConfirm: (selectedIds: string[] | null) => void;
};

export function FolhaRascunhoStudentSelectModal({
  open,
  onOpenChange,
  classId,
  className,
  schoolId,
  initialSelectedIds,
  onConfirm,
}: Props) {
  const { toast } = useToast();
  const [students, setStudents] = useState<FolhaRascunhoClassStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !classId) return;
    let cancelled = false;
    setLoading(true);
    setSearchTerm("");
    fetchClassStudentsForFolhaRascunho(classId, schoolId)
      .then((list) => {
        if (cancelled) return;
        setStudents(list);
        if (initialSelectedIds && initialSelectedIds.length > 0) {
          setDraftSelected(new Set(initialSelectedIds));
        } else {
          setDraftSelected(new Set(list.map((s) => s.id)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Erro",
            description: "Não foi possível carregar os alunos da turma.",
            variant: "destructive",
          });
          setStudents([]);
          setDraftSelected(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, classId, schoolId, initialSelectedIds, toast]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.registration && s.registration.toLowerCase().includes(q))
    );
  }, [students, searchTerm]);

  const allSelected = students.length > 0 && draftSelected.size === students.length;

  const toggleOne = (id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setDraftSelected(new Set(students.map((s) => s.id)));
  const clearAll = () => setDraftSelected(new Set());

  const handleConfirm = () => {
    if (draftSelected.size === 0) {
      toast({
        title: "Seleção vazia",
        description: "Selecione ao menos um aluno ou use \"Todos os alunos\".",
        variant: "destructive",
      });
      return;
    }
    if (allSelected) {
      onConfirm(null);
    } else {
      onConfirm(Array.from(draftSelected));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full max-w-lg flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Selecionar alunos
          </DialogTitle>
          <DialogDescription>
            Turma <strong>{className}</strong>. Marque os alunos que terão folha de rascunho no PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {draftSelected.size} de {students.length} selecionado(s)
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={loading || !students.length}>
            Todos
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={loading}>
            Limpar
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Carregando alunos...</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {searchTerm ? "Nenhum aluno encontrado para a busca." : "Nenhum aluno matriculado nesta turma."}
            </p>
          ) : (
            <ul className="divide-y p-2">
              {filtered.map((student) => (
                <li key={student.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                    <Checkbox
                      checked={draftSelected.has(student.id)}
                      onCheckedChange={() => toggleOne(student.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-tight">{student.name}</span>
                      {student.registration ? (
                        <span className="text-xs text-muted-foreground">Matrícula: {student.registration}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={loading}>
            Confirmar seleção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
