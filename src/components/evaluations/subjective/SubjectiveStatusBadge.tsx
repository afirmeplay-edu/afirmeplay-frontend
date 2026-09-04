import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusMeta, type SubjectiveCorrectionStatus } from "@/lib/subjectiveRubric";

export function SubjectiveStatusBadge({
  status,
  className,
}: {
  status?: SubjectiveCorrectionStatus | null;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", meta.className, className)}>
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </Badge>
  );
}

export default SubjectiveStatusBadge;
