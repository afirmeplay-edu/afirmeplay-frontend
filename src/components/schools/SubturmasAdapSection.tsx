import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2, UserMinus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  badgesFromSubturmas,
  isSpecialEducationClass,
  levelsFromSubturmas,
  type SubturmaGrade,
  type SubturmaItem,
} from "@/lib/subturma";

const LEVELS = [1, 2, 3] as const;

interface ClassStudent {
  id: string;
  name: string;
}

function apiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return data?.error || data?.message || fallback;
}

function foldName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

interface Props {
  classId: string;
  grade?: SubturmaGrade | null;
  students: ClassStudent[];
  canManage: boolean;
  onBadges?: (badges: Record<string, string>) => void;
  onLevels?: (levels: string[]) => void;
  reloadToken?: number;
}

export function SubturmasAdapSection({ classId, grade, students, canManage, onBadges, onLevels, reloadToken = 0 }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<SubturmaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [picker, setPicker] = useState<SubturmaItem | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<SubturmaItem | null>(null);
  const special = isSpecialEducationClass(grade);
  const onLevelsRef = useRef(onLevels);
  onLevelsRef.current = onLevels;

  const load = useCallback(async (options?: { silent?: boolean }): Promise<SubturmaItem[]> => {
    void reloadToken;
    if (special) {
      setItems([]);
      onBadges?.({});
      onLevelsRef.current?.([]);
      setLoading(false);
      return [];
    }
    if (!options?.silent) setLoading(true);
    try {
      const response = await api.get(`/classes/${classId}/subturmas`);
      const list = (response.data?.subturmas || []) as SubturmaItem[];
      setItems(list);
      onBadges?.(badgesFromSubturmas(list));
      onLevelsRef.current?.(levelsFromSubturmas(list));
      setHidden(false);
      return list;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setHidden(true);
        onBadges?.({});
        onLevelsRef.current?.([]);
      } else {
        toast({
          title: "Subturmas ADAP",
          description: apiError(error, "Não foi possível carregar as subturmas."),
          variant: "destructive",
        });
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [classId, special, onBadges, toast, reloadToken]);

  useEffect(() => {
    load();
  }, [load]);

  const missing = useMemo(
    () => LEVELS.filter((level) => !items.some((item) => item.support_level === level)),
    [items]
  );

  const levelByStudent = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      for (const aluno of item.alunos || []) {
        map.set(aluno.id, item.display_name);
      }
    }
    return map;
  }, [items]);

  const pickerStudents = useMemo(() => {
    if (!picker) return [];
    const taken = new Set(picker.alunos.map((aluno) => aluno.id));
    const folded = foldName(query.trim());
    return students
      .filter((student) => !taken.has(student.id))
      .filter((student) => !folded || foldName(student.name).includes(folded))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [picker, query, students]);

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

  const openPicker = (item: SubturmaItem) => {
    setPicker(item);
    setQuery("");
    setSelectedIds([]);
  };

  const addSelected = async () => {
    if (!picker || selectedIds.length === 0) return;
    const target = picker;
    const ids = [...selectedIds];
    setBusy(true);
    const failedIds: string[] = [];
    for (const studentId of ids) {
      try {
        await api.post(`/classes/${classId}/subturmas/${target.id}/alunos`, { student_id: studentId });
      } catch {
        failedIds.push(studentId);
      }
    }
    const next = await load({ silent: true });
    const fresh = next.find((item) => item.id === target.id) ?? null;
    setPicker(fresh);
    const added = ids.length - failedIds.length;
    if (failedIds.length === 0) {
      setPicker(null);
      setSelectedIds([]);
      setQuery("");
      toast({
        title: target.display_name,
        description: added === 1 ? "1 aluno adicionado." : `${added} alunos adicionados.`,
      });
    } else {
      setSelectedIds(failedIds);
      toast({
        title: target.display_name,
        description:
          added > 0
            ? `${added === 1 ? "1 adicionado" : `${added} adicionados`}. ${failedIds.length === 1 ? "1 continua" : `${failedIds.length} continuam`} sem este nível.`
            : "Nenhum aluno entrou neste nível.",
        variant: "destructive",
      });
    }
    setBusy(false);
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
        <div>
          <h3 className="text-sm font-medium">Nível de suporte ADAP</h3>
          <p className="text-xs text-muted-foreground">
            O aluno continua nesta turma. Outro nível substitui o anterior.
          </p>
        </div>
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
          {items.map((item) => (
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
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openPicker(item)}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Adicionar alunos
                  </Button>
                )}
              </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!picker}
        onOpenChange={(open) => {
          if (open || busy) return;
          setPicker(null);
          setQuery("");
          setSelectedIds([]);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar em {picker?.display_name}</DialogTitle>
            <DialogDescription>
              Marque quem entra neste nível.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="adap-student-search" className="text-sm font-medium">
                Buscar aluno
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="adap-student-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome do aluno..."
                  className="pl-8"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {pickerStudents.length === 1 ? "1 aluno na lista" : `${pickerStudents.length} alunos na lista`}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || pickerStudents.length === 0}
                onClick={() => {
                  const visibleIds = pickerStudents.map((student) => student.id);
                  const allVisible = visibleIds.every((id) => selectedIds.includes(id));
                  setSelectedIds((current) =>
                    allVisible
                      ? current.filter((id) => !visibleIds.includes(id))
                      : Array.from(new Set([...current, ...visibleIds]))
                  );
                }}
              >
                {pickerStudents.length > 0 && pickerStudents.every((student) => selectedIds.includes(student.id))
                  ? "Desmarcar os visíveis"
                  : "Marcar os visíveis"}
              </Button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {pickerStudents.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? "Nenhum aluno com esse nome."
                    : "Todos os alunos desta turma já estão neste nível."}
                </p>
              ) : (
                pickerStudents.map((student) => {
                  const current = levelByStudent.get(student.id);
                  const checked = selectedIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={(value) => {
                          setSelectedIds((currentIds) =>
                            value === true
                              ? [...currentIds, student.id]
                              : currentIds.filter((id) => id !== student.id)
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{student.name}</span>
                      {current ? <Badge variant="secondary">{current}</Badge> : null}
                    </label>
                  );
                })
              )}
            </div>
            {selectedIds.some((id) => levelByStudent.has(id)) ? (
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const moving = selectedIds.filter((id) => levelByStudent.has(id)).length;
                  return moving === 1
                    ? `1 aluno sai do nível atual e passa para ${picker?.display_name}.`
                    : `${moving} alunos saem do nível atual e passam para ${picker?.display_name}.`;
                })()}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPicker(null);
                setQuery("");
                setSelectedIds([]);
              }}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={busy || selectedIds.length === 0} onClick={addSelected}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedIds.length === 0
                ? "Adicionar alunos"
                : selectedIds.length === 1
                  ? "Adicionar 1 aluno"
                  : `Adicionar ${selectedIds.length} alunos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
