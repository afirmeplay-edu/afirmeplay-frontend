import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  OFFLINE_PACK_MAX_REDEMPTIONS_MAX,
  OFFLINE_PACK_MAX_REDEMPTIONS_MIN,
  OFFLINE_PACK_TTL_MAX,
  OFFLINE_PACK_TTL_MIN,
} from '@/services/mobile/offlinePackApi';

interface OfflinePackValidityCardProps {
  ttlHours: number;
  onTtlChange: (v: number) => void;
  maxRedemptions: number;
  onMaxRedemptionsChange: (v: number) => void;
  minMaxRedemptions?: number;
  ttlHint?: string;
  idPrefix?: string;
  /** Na edição de pacote expirado, destacar renovação por TTL. */
  isExpired?: boolean;
  disabled?: boolean;
}

export function OfflinePackValidityCard({
  ttlHours,
  onTtlChange,
  maxRedemptions,
  onMaxRedemptionsChange,
  minMaxRedemptions = OFFLINE_PACK_MAX_REDEMPTIONS_MIN,
  ttlHint,
  idPrefix = 'offline',
  isExpired = false,
  disabled = false,
}: OfflinePackValidityCardProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarClock className="h-4 w-4" />
          Validade e uso do código
        </CardTitle>
        <CardDescription>
          {isExpired
            ? 'Este pacote está expirado. Informe novas horas de validade para renovar.'
            : 'Defina por quanto tempo o código permanece válido e quantas vezes pode ser utilizado no app.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-ttl`}>
            {isExpired ? 'Renovar validade (horas)' : 'Validade (horas)'}
          </Label>
          <Input
            id={`${idPrefix}-ttl`}
            type="number"
            min={OFFLINE_PACK_TTL_MIN}
            max={OFFLINE_PACK_TTL_MAX}
            value={ttlHours}
            onChange={(e) => onTtlChange(Number(e.target.value) || 0)}
            disabled={disabled}
          />
          <p className="text-muted-foreground text-xs">
            {ttlHint ?? `Entre ${OFFLINE_PACK_TTL_MIN} e ${OFFLINE_PACK_TTL_MAX} horas (até 14 dias).`}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-max-red`}>Máximo de resgates</Label>
          <Input
            id={`${idPrefix}-max-red`}
            type="number"
            min={minMaxRedemptions}
            max={OFFLINE_PACK_MAX_REDEMPTIONS_MAX}
            value={maxRedemptions}
            onChange={(e) => onMaxRedemptionsChange(Number(e.target.value) || 0)}
            disabled={disabled}
          />
          <p className="text-muted-foreground text-xs">
            Entre {minMaxRedemptions} e {OFFLINE_PACK_MAX_REDEMPTIONS_MAX.toLocaleString('pt-BR')}{' '}
            utilizações.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
