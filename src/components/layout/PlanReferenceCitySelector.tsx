import { useAuth } from '@/context/authContext';
import { usePlanContextOptional } from '@/context/PlanContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type PlanReferenceCitySelectorProps = {
  className?: string;
  compact?: boolean;
};

/**
 * Seletor global de município de referência (admin).
 * Usado para branding e X-City-ID padrão; não limita filtros de outras páginas.
 */
export function PlanReferenceCitySelector({
  className,
  compact = false,
}: PlanReferenceCitySelectorProps) {
  const { user } = useAuth();
  const planCtx = usePlanContextOptional();

  if ((user.role ?? '').toLowerCase() !== 'admin' || !planCtx) {
    return null;
  }

  const {
    referenceCityId,
    referenceCity,
    cities,
    citiesLoading,
    setReferenceCityId,
  } = planCtx;

  if (citiesLoading && cities.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground text-sm', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {!compact && <span>Municípios...</span>}
      </div>
    );
  }

  if (cities.length === 0) return null;

  const planLabel =
    referenceCity?.entitlements?.plan_code ??
    referenceCity?.plan_code ??
    'basic';

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      {!compact && (
        <span className="hidden lg:inline text-xs text-muted-foreground whitespace-nowrap">
          Referência
        </span>
      )}
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select
        value={referenceCityId ?? ''}
        onValueChange={(value) => setReferenceCityId(value || null)}
      >
        <SelectTrigger
          className={cn(
            'h-8 text-xs',
            compact ? 'w-[140px]' : 'w-[180px] lg:w-[220px]'
          )}
          aria-label="Município de referência"
        >
          <SelectValue placeholder="Município" />
        </SelectTrigger>
        <SelectContent>
          {cities.map((city) => (
            <SelectItem key={city.id} value={city.id}>
              {city.name}
              {city.state ? ` · ${city.state}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && referenceCityId && (
        <span className="hidden md:inline text-[10px] uppercase tracking-wide text-muted-foreground">
          {planLabel}
        </span>
      )}
    </div>
  );
}
