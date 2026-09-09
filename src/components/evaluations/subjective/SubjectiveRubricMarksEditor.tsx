import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import {
  DEFAULT_RUBRIC_MARKS,
  contrastText,
  rubricShortLabel,
  type SubjectiveRubricMark,
} from "@/lib/subjectiveRubric";

type Props = {
  marks: SubjectiveRubricMark[];
  onChange: (next: SubjectiveRubricMark[]) => void;
  disabled?: boolean;
};

function emptyMark(index: number): SubjectiveRubricMark {
  return {
    code: `M${index + 1}`,
    label: "",
    color: "#7c3aed",
    weight: 0,
    sort_order: index,
  };
}

export function SubjectiveRubricMarksEditor({ marks, onChange, disabled }: Props) {
  const update = (index: number, patch: Partial<SubjectiveRubricMark>) => {
    onChange(marks.map((m, i) => (i === index ? { ...m, ...patch, sort_order: i } : { ...m, sort_order: i })));
  };

  const add = () => {
    onChange([...marks, emptyMark(marks.length)]);
  };

  const remove = (index: number) => {
    if (marks.length <= 2) return;
    onChange(marks.filter((_, i) => i !== index).map((m, i) => ({ ...m, sort_order: i })));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Cada marcação tem um peso de 0 a 1 (1 = acerto pleno da questão). O template inicial é
          Sim / Parcial / Não / Branco — edite, inclua ou remova.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(DEFAULT_RUBRIC_MARKS.map((m) => ({ ...m })))}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restaurar padrão
        </Button>
      </div>

      <div className="space-y-2">
        {marks.map((mark, index) => (
          <div
            key={`${mark.code}-${index}`}
            className="grid items-end gap-2 rounded-xl border bg-card p-3 md:grid-cols-[auto_1fr_110px_110px_auto]"
          >
            <div className="space-y-1">
              <Label className="text-[11px]">Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={mark.color || "#64748b"}
                  disabled={disabled}
                  onChange={(e) => update(index, { color: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border bg-transparent p-0"
                  title="Cor da marcação"
                />
                <span
                  className="grid h-9 min-w-9 place-items-center rounded-md px-2 text-xs font-bold"
                  style={{ background: mark.color, color: contrastText(mark.color) }}
                >
                  {rubricShortLabel(mark)}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Rótulo *</Label>
              <Input
                value={mark.label}
                disabled={disabled}
                placeholder="Ex.: Plenamente"
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Sigla</Label>
              <Input
                value={mark.code}
                disabled={disabled}
                maxLength={20}
                placeholder="SIM"
                onChange={(e) =>
                  update(index, {
                    code: e.target.value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase(),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Peso (0–1)</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                disabled={disabled}
                value={mark.weight}
                onChange={(e) => update(index, { weight: Number(e.target.value) })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || marks.length <= 2}
              onClick={() => remove(index)}
              title="Remover marcação"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" disabled={disabled || marks.length >= 12} onClick={add}>
        <Plus className="mr-1 h-4 w-4" />
        Nova marcação
      </Button>
    </div>
  );
}

export default SubjectiveRubricMarksEditor;
