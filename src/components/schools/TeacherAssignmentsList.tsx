import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export type AssignmentClassOption = {
  id: string;
  name: string;
  gradeId: string;
  gradeName: string;
};

export type AssignmentTeacher = {
  id: string;
  name: string;
  email?: string;
};

export type AssignmentLink = {
  id: string;
  user_id?: string;
  vinculo_id?: string;
};

type TeacherAssignmentsListProps = {
  teachers: AssignmentTeacher[];
  classes: AssignmentClassOption[];
  classTeachers: Record<string, AssignmentLink[]>;
  canEdit: boolean;
  showEmail: boolean;
  onChanged: () => Promise<void> | void;
};

function resumoSelecao(nomes: string[], vazio: string, unidade: string): string {
  if (nomes.length === 0) return vazio;
  if (nomes.length <= 2) return nomes.join(", ");
  return `${nomes.length} ${unidade}`;
}

function vinculosDoProfessor(
  teacher: AssignmentTeacher,
  classes: AssignmentClassOption[],
  classTeachers: Record<string, AssignmentLink[]>
) {
  const porTurma = new Map<string, string>();
  for (const turma of classes) {
    const vinculados = classTeachers[turma.id] ?? [];
    const match = vinculados.find(
      (item) => item.id === teacher.id || (item.user_id && item.user_id === teacher.id)
    );
    if (match) porTurma.set(turma.id, match.vinculo_id ?? "");
  }
  return porTurma;
}

function MultiCheck({
  label,
  emptyLabel,
  unitLabel,
  options,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  emptyLabel: string;
  unitLabel: string;
  options: Array<{ id: string; name: string }>;
  selected: Set<string>;
  disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const nomes = options.filter((option) => selected.has(option.id)).map((option) => option.name);
  return (
    <div className="space-y-1 min-w-0 w-full sm:w-44">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || options.length === 0}
            className="h-8 w-full justify-between px-2 font-normal"
            title={nomes.join(", ") || emptyLabel}
          >
            <span className="truncate">{resumoSelecao(nomes, options.length === 0 ? "Sem opções" : emptyLabel, unitLabel)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma opção disponível.</p>
            ) : (
              options.map((option) => {
                const checked = selected.has(option.id);
                return (
                  <div
                    key={option.id}
                    role="checkbox"
                    aria-checked={checked}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => {
                      if (!disabled) onToggle(option.id, !checked);
                    }}
                  >
                    <Checkbox checked={checked} disabled={disabled} className="pointer-events-none" tabIndex={-1} />
                    <span className="min-w-0 truncate">{option.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function TeacherAssignmentsList({
  teachers,
  classes,
  classTeachers,
  canEdit,
  showEmail,
  onChanged,
}: TeacherAssignmentsListProps) {
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const anos = (() => {
    const map = new Map<string, string>();
    for (const turma of classes) {
      if (!turma.gradeId || !turma.gradeName) continue;
      if (!map.has(turma.gradeId)) map.set(turma.gradeId, turma.gradeName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  })();

  const turmasOrdenadas = [...classes].sort((a, b) => {
    const serie = a.gradeName.localeCompare(b.gradeName, "pt-BR", { numeric: true });
    if (serie !== 0) return serie;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  });

  const persistir = async (teacher: AssignmentTeacher, proximas: Set<string>) => {
    const atuais = vinculosDoProfessor(teacher, classes, classTeachers);
    const adicionar = [...proximas].filter((id) => !atuais.has(id));
    const remover = [...atuais.keys()].filter((id) => !proximas.has(id));
    if (adicionar.length === 0 && remover.length === 0) return;

    setSavingId(teacher.id);
    const erros: string[] = [];
    try {
      for (const classId of adicionar) {
        try {
          await api.post("/teacher-class", { teacher_id: teacher.id, class_id: classId });
        } catch {
          erros.push(classes.find((turma) => turma.id === classId)?.name || "turma");
        }
      }
      for (const classId of remover) {
        const vinculoId = atuais.get(classId);
        if (!vinculoId) {
          erros.push(classes.find((turma) => turma.id === classId)?.name || "turma");
          continue;
        }
        try {
          await api.delete(`/teacher-class/${vinculoId}`);
        } catch {
          erros.push(classes.find((turma) => turma.id === classId)?.name || "turma");
        }
      }
      await onChanged();
      if (erros.length > 0) {
        toast({
          title: "Vínculo parcial",
          description: `Não foi possível atualizar: ${erros.join(", ")}.`,
          variant: "destructive",
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
      {teachers.map((teacher) => {
        const vinculados = vinculosDoProfessor(teacher, classes, classTeachers);
        const anosSelecionados = new Set(
          turmasOrdenadas
            .filter((turma) => vinculados.has(turma.id) && turma.gradeId)
            .map((turma) => turma.gradeId)
        );
        const salvando = savingId === teacher.id;
        const nomesAnos = anos.filter((ano) => anosSelecionados.has(ano.id)).map((ano) => ano.name);
        const nomesTurmas = turmasOrdenadas
          .filter((turma) => vinculados.has(turma.id))
          .map((turma) => (turma.gradeName ? `${turma.gradeName} — ${turma.name}` : turma.name));

        return (
          <div key={teacher.id} className="flex flex-col gap-3 px-3 py-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{teacher.name}</div>
              {showEmail && teacher.email ? (
                <div className="text-xs text-muted-foreground truncate">{teacher.email}</div>
              ) : null}
            </div>
            {canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <MultiCheck
                  label="Anos"
                  emptyLabel="Nenhum ano"
                  unitLabel="anos"
                  options={anos}
                  selected={anosSelecionados}
                  disabled={salvando}
                  onToggle={(gradeId, checked) => {
                    const proximas = new Set(vinculados.keys());
                    for (const turma of classes) {
                      if (turma.gradeId !== gradeId) continue;
                      if (checked) proximas.add(turma.id);
                      else proximas.delete(turma.id);
                    }
                    void persistir(teacher, proximas);
                  }}
                />
                <MultiCheck
                  label="Turmas"
                  emptyLabel="Nenhuma turma"
                  unitLabel="turmas"
                  options={turmasOrdenadas.map((turma) => ({
                    id: turma.id,
                    name: turma.gradeName ? `${turma.gradeName} — ${turma.name}` : turma.name,
                  }))}
                  selected={new Set(vinculados.keys())}
                  disabled={salvando}
                  onToggle={(classId, checked) => {
                    const proximas = new Set(vinculados.keys());
                    if (checked) proximas.add(classId);
                    else proximas.delete(classId);
                    void persistir(teacher, proximas);
                  }}
                />
                {salvando ? <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                <span>Anos: {nomesAnos.length > 0 ? nomesAnos.join(", ") : "—"}</span>
                <span>Turmas: {nomesTurmas.length > 0 ? nomesTurmas.join(", ") : "—"}</span>
              </div>
            )}
            <Badge variant="secondary" className="w-fit text-[10px] font-normal shrink-0">
              Professor
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
