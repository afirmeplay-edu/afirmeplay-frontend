import {
  getReportProficiencyTagClass,
  normalizeProficiencyLevelLabel,
} from '@/utils/report/reportTagStyles';
import { cn } from '@/lib/utils';
import { getLevelSurfaceClasses } from '../lib/proficiencyLevelTokens';

type NivelBadgeProps = {
  nivel?: string | null;
  className?: string;
};

export function NivelBadge({ nivel, className }: NivelBadgeProps) {
  const label = normalizeProficiencyLevelLabel(nivel);
  const surface = getLevelSurfaceClasses(label);

  return (
    <span
      className={cn(
        getReportProficiencyTagClass(label),
        'normal-case tracking-normal',
        className
      )}
    >
      <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', surface.dot)} aria-hidden />
      {label}
    </span>
  );
}
