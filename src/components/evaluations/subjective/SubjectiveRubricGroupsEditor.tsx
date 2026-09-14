import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { SubjectiveRubricMarksEditor } from "@/components/evaluations/subjective/SubjectiveRubricMarksEditor";
import {
  createDefaultRubricGroup,
  type SubjectiveRubricGroup,
} from "@/lib/subjectiveRubric";

type Props = {
  groups: SubjectiveRubricGroup[];
  onChange: (next: SubjectiveRubricGroup[]) => void;
  disabled?: boolean;
};

export function SubjectiveRubricGroupsEditor({ groups, onChange, disabled }: Props) {
  const updateGroup = (index: number, patch: Partial<SubjectiveRubricGroup>) => {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch, sort_order: i } : { ...g, sort_order: i })));
  };

  const addGroup = () => {
    onChange([...groups, createDefaultRubricGroup(groups.length)]);
  };

  const removeGroup = (index: number) => {
    if (groups.length <= 1) return;
    onChange(groups.filter((_, i) => i !== index).map((g, i) => ({ ...g, sort_order: i })));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Crie um ou mais grupos de critérios. No passo seguinte, escolha qual grupo cada questão usa
        (ex.: alfabetização na Q1, interpretação na Q2).
      </p>

      {groups.map((group, index) => (
        <div key={group.temp_key || group.id || `group-${index}`} className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-[11px]">Nome do grupo *</Label>
              <Input
                value={group.name}
                disabled={disabled}
                placeholder="Ex.: Alfabetização — nome"
                onChange={(e) => updateGroup(index, { name: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || groups.length <= 1}
              onClick={() => removeGroup(index)}
              title="Remover grupo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <SubjectiveRubricMarksEditor
            marks={group.marks}
            disabled={disabled}
            onChange={(marks) => updateGroup(index, { marks })}
          />
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" disabled={disabled || groups.length >= 20} onClick={addGroup}>
        <Plus className="mr-1 h-4 w-4" />
        Novo grupo de critérios
      </Button>
    </div>
  );
}

export default SubjectiveRubricGroupsEditor;
