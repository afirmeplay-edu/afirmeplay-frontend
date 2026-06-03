import { Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CLASS_SHIFT_OPTIONS,
  type ClassShiftCanonical,
  classShiftSelectorClearClass,
  classShiftSelectorOptionClass,
  normalizeClassShift,
} from "@/lib/classShift";

interface ClassShiftSelectorProps {
  value?: string | null;
  onChange: (value: ClassShiftCanonical | null) => void;
  disabled?: boolean;
  showLabel?: boolean;
  allowClear?: boolean;
  className?: string;
}

export function ClassShiftSelector({
  value,
  onChange,
  disabled = false,
  showLabel = true,
  allowClear = true,
  className,
}: ClassShiftSelectorProps) {
  const selected = normalizeClassShift(value);

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel ? (
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Turno da turma
        </Label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {CLASS_SHIFT_OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                disabled && "opacity-50 cursor-not-allowed",
                classShiftSelectorOptionClass(opt.value, isActive)
              )}
              aria-pressed={isActive}
            >
              <span aria-hidden>{opt.icon}</span>
              {opt.label}
            </button>
          );
        })}
        {allowClear ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className={cn(
              "inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              disabled && "opacity-50 cursor-not-allowed",
              classShiftSelectorClearClass(selected === null && !String(value ?? "").trim())
            )}
            aria-pressed={selected === null && !String(value ?? "").trim()}
          >
            Sem turno
          </button>
        ) : null}
      </div>
    </div>
  );
}
