import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatMunicipalityAvailableFrom,
  getMunicipalityAvailabilityStatus,
  type MunicipalityAvailabilityFields,
} from '@/lib/municipalityAvailability';

const STATUS_CLASS: Record<string, string> = {
  released:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  scheduled:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  hidden:
    'border-border bg-muted text-muted-foreground',
};

interface MunicipalityAvailabilityBadgeProps {
  item: MunicipalityAvailabilityFields;
  className?: string;
}

export function MunicipalityAvailabilityBadge({
  item,
  className,
}: MunicipalityAvailabilityBadgeProps) {
  const status = getMunicipalityAvailabilityStatus(item);
  const scheduledAt =
    status === 'scheduled' ? formatMunicipalityAvailableFrom(item.available_from) : '';

  const label =
    status === 'hidden'
      ? 'Oculto'
      : status === 'scheduled'
        ? scheduledAt
          ? `Agendado · ${scheduledAt}`
          : 'Agendado'
        : 'Liberado';

  return (
    <Badge variant="outline" className={cn('text-xs font-normal', STATUS_CLASS[status], className)}>
      {label}
    </Badge>
  );
}
