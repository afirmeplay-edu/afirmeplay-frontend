import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const ADAP_STAGE_ID = "247c4af5-2688-41b0-95fa-443f503a9d87";
const LEVELS = [1, 2, 3] as const;

export interface SubturmaAluno {
  id: string;
  name: string;
}

export interface SubturmaItem {
  id: string;
  support_level: number;
  display_name: string;
  alunos: SubturmaAluno[];
}

interface GradeLike {
  name?: string;
  education_stage_id?: string;
  education_stage?: { id?: string; name?: string } | null;
}

interface ClassStudent {
  id: string;
  name: string;
}

export function isSpecialEducationClass(grade?: GradeLike | null): boolean {
  if (!grade) return false;
  const stageId = grade.education_stage?.id || grade.education_stage_id;
  if (stageId && stageId === ADAP_STAGE_ID) return true;
  const name = (grade.name || "").trim();
  return /^(suporte|adap)\s*[123]$/i.test(name);
}

export function badgesFromSubturmas(items: SubturmaItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    for (const aluno of item.alunos || []) {
      map[aluno.id] = item.display_name;
    }
  }
  return map;
}

function apiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || fallback;
}

interface Props {
  classId: string;
  grade?: GradeLike | null;
  students: ClassStudent[];
  canManage: boolean;
  onBadges?: (badges: Record<string, string>) => void;
}

export function SubturmasAdapSection({ classId, grade, students, canManage, onBadges }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<SubturmaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<SubturmaItem | null>(null);
  const special = isSpecialEducationClass(grade);

  const load = useCallback(async () => {
    if (special) {
      setItems([]);
      onBadges?.({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/classes/${classId}/subturmas`);
      const list = (response.data?.subturmas || []) as SubturmaItem[];
      setItems(list);
      onBadges?.(badgesFromSubturmas(list));
      setHidden(false);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setHidden(true);
        onBadges?.({});
      } else {
        toast({
          title: "Subturmas ADAP",
          description: apiError(error, "Não foi possível carregar as subturmas."),
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [classId, special, onBadges, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const missing = useMemo(
    () => LEVELS.filter((level) => !items.some((item) => item.support_level === level)),
    [items]
  );

  if (special || hidden) return null;

  const create = async (level: number) => {
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/subturmas`, { support_level: level });
      await load();
    } catch (error) {
      toast({
        title: "Subturma",
        description: apiError(error, "Não foi possível criar a subturma."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const addStudent = async (subturmaId: string) => {
    const studentId = pick[subturmaId];
    if (!studentId) return;
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/subturmas/${subturmaId}/alunos`, { student_id: studentId });
      setPick((prev) => ({ ...prev, [subturmaId]: "" }));
      await load();
    } catch (error) {
      toast({
        title: "Subturma",
        description: apiError(error, "Não foi possível adicionar o aluno."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeStudent = async (subturmaId: string, studentId: string) => {
    setBusy(true);
    try {
      await api.delete(`/classes/${classId}/subturmas/${subturmaId}/alunos/${studentId}`);
      await load();
    } catch (error) {
      toast({
        title: "Subturma",
        description: apiError(error, "Não foi possível remover o aluno."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.delete(`/classes/${classId}/subturmas/${pendingDelete.id}`);
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast({
        title: "Subturma",
        description: apiError(error, "Não foi possível excluir a subturma."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Subturmas ADAP</h3>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {missing.map((level) => (
              <Button key={level} type="button" size="sm" variant="outline" disabled={busy} onClick={() => create(level)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                ADAP {level}
              </Button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando subturmas
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma subturma ADAP nesta turma.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const already = new Set(item.alunos.map((aluno) => aluno.id));
            const options = students.filter((student) => !already.has(student.id));
            return (
              <div key={item.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{item.display_name}</Badge>
                  {canManage && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPendingDelete(item)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  )}
                </div>
                {item.alunos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum aluno nesta subturma.</p>
                ) : (
                  <ul className="space-y-1">
                    {item.alunos.map((aluno) => (
                      <li key={aluno.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{aluno.name}</span>
                        {canManage && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => removeStudent(item.id, aluno.id)}
                          >
                            <UserMinus className="mr-1 h-3.5 w-3.5" />
                            Remover
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={pick[item.id] || undefined} onValueChange={(value) => setPick((prev) => ({ ...prev, [item.id]: value }))}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Aluno da turma" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            Nenhum aluno disponível
                          </SelectItem>
                        ) : (
                          options.map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" disabled={busy || !pick[item.id]} onClick={() => addStudent(item.id)}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      Adicionar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {pendingDelete?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os alunos continuam nesta turma regular. Eles apenas deixam de pertencer à subturma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir subturma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
