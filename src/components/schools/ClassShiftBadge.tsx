import { cn } from "@/lib/utils";
import { classShiftBadgeClass, getClassShiftLabel } from "@/lib/classShift";

interface ClassShiftBadgeProps {
  shift?: string | null;
  className?: string;
}

export function ClassShiftBadge({ shift, className }: ClassShiftBadgeProps) {
  const label = getClassShiftLabel(shift);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        classShiftBadgeClass(shift),
        className
      )}
    >
      {label}
    </span>
  );
}
