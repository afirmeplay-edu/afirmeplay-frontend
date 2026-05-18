import { Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OFFLINE_SELECT_NONE, type CityRow, type StateOption } from './offlinePackShared';

interface OfflinePackLocationCardProps {
  states: StateOption[];
  cities: CityRow[];
  selectedStateId: string;
  onStateChange: (id: string) => void;
  selectedCityId: string;
  onCityChange: (id: string) => void;
  loadingStates: boolean;
  loadingCities: boolean;
  idPrefix?: string;
  disabled?: boolean;
}

export function OfflinePackLocationCard({
  states,
  cities,
  selectedStateId,
  onStateChange,
  selectedCityId,
  onCityChange,
  loadingStates,
  loadingCities,
  idPrefix = 'offline',
  disabled = false,
}: OfflinePackLocationCardProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-4 w-4" />
          Localização
        </CardTitle>
        <CardDescription>
          O código vale para o município selecionado. Administradores escolhem estado e município;
          demais perfis usam o município vinculado à conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-state`}>Estado</Label>
          <Select
            value={selectedStateId}
            onValueChange={onStateChange}
            disabled={disabled || loadingStates}
          >
            <SelectTrigger id={`${idPrefix}-state`}>
              <SelectValue placeholder={loadingStates ? 'Carregando…' : 'Selecione o estado'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OFFLINE_SELECT_NONE} disabled className="text-muted-foreground">
                Selecione o estado
              </SelectItem>
              {states.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-city`}>Município</Label>
          <Select
            value={selectedCityId}
            onValueChange={onCityChange}
            disabled={disabled || selectedStateId === OFFLINE_SELECT_NONE || loadingCities}
          >
            <SelectTrigger id={`${idPrefix}-city`}>
              <SelectValue placeholder={loadingCities ? 'Carregando…' : 'Selecione o município'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OFFLINE_SELECT_NONE} disabled className="text-muted-foreground">
                Selecione o município
              </SelectItem>
              {cities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
