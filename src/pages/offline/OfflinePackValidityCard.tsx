import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  OFFLINE_PACK_EXPIRES_MAX_DAYS,
  OFFLINE_PACK_MAX_REDEMPTIONS_MAX,
  OFFLINE_PACK_MAX_REDEMPTIONS_MIN,
} from '@/services/mobile/offlinePackApi';
import { datetimeLocalMinMax } from '@/utils/date';

interface OfflinePackValidityCardProps {
  expiresAtLocal: string;
  onExpiresAtChange: (v: string) => void;
  maxRedemptions: number;
  onMaxRedemptionsChange: (v: number) => void;
  minMaxRedemptions?: number;
  expiresHint?: string;
  idPrefix?: string;
  /** Na edição de pacote expirado, destacar renovação por data/hora. */
  isExpired?: boolean;
  disabled?: boolean;
}

export function OfflinePackValidityCard({
  expiresAtLocal,
  onExpiresAtChange,
  maxRedemptions,
  onMaxRedemptionsChange,
  minMaxRedemptions = OFFLINE_PACK_MAX_REDEMPTIONS_MIN,
  expiresHint,
  idPrefix = 'offline',
  isExpired = false,
  disabled = false,
}: OfflinePackValidityCardProps) {
  const { min, max } = datetimeLocalMinMax(OFFLINE_PACK_EXPIRES_MAX_DAYS);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarClock className="h-4 w-4" />
          Validade e uso do código
        </CardTitle>
        <CardDescription>
          {isExpired
            ? 'Este pacote está expirado. Informe uma data e hora futuras para renovar.'
            : 'Defina até quando o código permanece válido e quantas vezes pode ser utilizado no app.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-expires`}>
            {isExpired ? 'Renovar validade (data e hora)' : 'Validade (data e hora)'}
          </Label>
          <Input
            id={`${idPrefix}-expires`}
            type="datetime-local"
            min={min}
            max={max}
            value={expiresAtLocal}
            onChange={(e) => onExpiresAtChange(e.target.value)}
            disabled={disabled}
          />
          <p className="text-muted-foreground text-xs">
            {expiresHint ??
              `Depois de agora e no máximo ${OFFLINE_PACK_EXPIRES_MAX_DAYS} dias.`}
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
