import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface MunicipalityAvailabilityControlsProps {
  availableToMunicipality: boolean;
  availableFromLocal: string;
  onAvailableToMunicipalityChange: (value: boolean) => void;
  onAvailableFromLocalChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function MunicipalityAvailabilityControls({
  availableToMunicipality,
  availableFromLocal,
  onAvailableToMunicipalityChange,
  onAvailableFromLocalChange,
  disabled,
  idPrefix = 'municipality-availability',
}: MunicipalityAvailabilityControlsProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-switch`}>Disponível para o município</Label>
          <p className="text-xs text-muted-foreground">
            Diretor, coordenador, professor e aplicador só veem este conteúdo quando estiver liberado.
          </p>
        </div>
        <Switch
          id={`${idPrefix}-switch`}
          checked={availableToMunicipality}
          onCheckedChange={(checked) => {
            onAvailableToMunicipalityChange(checked);
            if (!checked) onAvailableFromLocalChange('');
          }}
          disabled={disabled}
        />
      </div>
      {availableToMunicipality ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-from`}>Liberar a partir de (opcional)</Label>
          <Input
            id={`${idPrefix}-from`}
            type="datetime-local"
            value={availableFromLocal}
            onChange={(e) => onAvailableFromLocalChange(e.target.value)}
            disabled={disabled}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            Deixe em branco para liberar imediatamente.
          </p>
        </div>
      ) : null}
    </div>
  );
}
