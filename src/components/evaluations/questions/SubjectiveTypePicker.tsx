import {
  type LucideIcon,
  HelpCircle,
  PenLine,
  MoveRight,
  Link2,
  ArrowUpDown,
  SquareDashed,
  Replace,
  Highlighter,
  Sigma,
  Layers,
} from "lucide-react";
import { SUBJECTIVE_QUESTION_TYPES, type InteractionType } from "@/lib/question-interactions";

const ICONS: Record<string, LucideIcon> = {
  PenLine,
  MoveRight,
  Link2,
  ArrowUpDown,
  SquareDashed,
  Replace,
  Highlighter,
  Sigma,
  Layers,
};

interface SubjectiveTypePickerProps {
  value: InteractionType;
  onChange: (type: InteractionType) => void;
}

/** Grade de seleção dos 9 subtipos de questão subjetiva (dissertativa, arrastar e soltar, etc.). */
export function SubjectiveTypePicker({ value, onChange }: SubjectiveTypePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {SUBJECTIVE_QUESTION_TYPES.map((meta) => {
        const selected = value === meta.value;
        const Icon = ICONS[meta.icon] ?? HelpCircle;
        return (
          <button
            key={meta.value}
            type="button"
            onClick={() => onChange(meta.value)}
            title={meta.description}
            className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
              selected
                ? "border-purple-500 bg-purple-100 dark:bg-purple-950/40 ring-1 ring-purple-500"
                : "border-border bg-card hover:border-purple-300 dark:hover:border-purple-700"
            }`}
          >
            <div
              className={`grid h-8 w-8 place-items-center rounded-lg ${
                selected ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-[11px] font-semibold leading-tight text-foreground">{meta.label}</div>
          </button>
        );
      })}
    </div>
  );
}

export default SubjectiveTypePicker;
