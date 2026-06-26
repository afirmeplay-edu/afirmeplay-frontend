import { useState, useEffect } from 'react';
import { Check, Loader2, Server, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  addMobileCity,
  getMobileCityApiError,
  listAvailableCities,
  type AddCityDedicatedRequest,
  type AddCitySharedRequest,
  type AvailableCity,
} from '@/services/mobile/mobileCitiesAdminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface MobileCitiesAdminFormProps {
  onSuccess: () => void;
}

type ModeType = 'shared' | 'dedicated';

export function MobileCitiesAdminForm({ onSuccess }: MobileCitiesAdminFormProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<ModeType>('shared');
  const [submitting, setSubmitting] = useState(false);

  // Shared mode
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [availableCities, setAvailableCities] = useState<AvailableCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState('');

  // Dedicated mode
  const [cityName, setCityName] = useState('');
  const [citySlug, setCitySlug] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  useEffect(() => {
    if (mode === 'shared') {
      loadAvailableCities();
    }
  }, [mode]);

  const loadAvailableCities = async () => {
    setLoadingAvailable(true);
    try {
      const response = await listAvailableCities();
      setAvailableCities(response.cities || []);
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar municípios',
        description: getMobileCityApiError(err, 'Não foi possível carregar a lista.'),
        variant: 'destructive',
      });
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleSubmitShared = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCityId) {
      toast({
        title: 'Município não selecionado',
        description: 'Selecione um município para adicionar.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const request: AddCitySharedRequest = {
        city_id: selectedCityId,
        hosting_mode: 'shared',
      };
      await addMobileCity(request);
      toast({
        title: 'Município adicionado',
        description: 'O município foi adicionado ao catálogo mobile com sucesso.',
      });
      setSelectedCityId('');
      onSuccess();
    } catch (err: unknown) {
      toast({
        title: 'Erro ao adicionar',
        description: getMobileCityApiError(err, 'Não foi possível adicionar o município.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDedicated = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    if (!cityName.trim() || !citySlug.trim() || !tenantCode.trim() || !apiBaseUrl.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos para continuar.',
        variant: 'destructive',
      });
      return;
    }

    // Validar URL
    try {
      new URL(apiBaseUrl);
    } catch {
      toast({
        title: 'URL inválida',
        description: 'A URL da API deve ser válida (ex: https://api.exemplo.com).',
        variant: 'destructive',
      });
      return;
    }

    // Validar que não é a URL central
    if (apiBaseUrl.includes('afirmeplay.com.br') || apiBaseUrl.includes('prod-api')) {
      toast({
        title: 'URL inválida',
        description: 'Para municípios da VPS central, use o modo "VPS Central".',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const request: AddCityDedicatedRequest = {
        city_name: cityName.trim(),
        city_slug: citySlug.trim(),
        tenant_code: tenantCode.trim(),
        hosting_mode: 'dedicated',
        api_base_url: apiBaseUrl.trim(),
      };
      await addMobileCity(request);
      toast({
        title: 'Município adicionado',
        description: 'O município foi adicionado ao catálogo mobile com sucesso.',
      });
      setCityName('');
      setCitySlug('');
      setTenantCode('');
      setApiBaseUrl('');
      onSuccess();
    } catch (err: unknown) {
      toast({
        title: 'Erro ao adicionar',
        description: getMobileCityApiError(err, 'Não foi possível adicionar o município.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCity = availableCities.find((c) => c.id === selectedCityId);

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base">Tipo de Hospedagem</Label>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as ModeType)}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label
            className={`flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
              mode === 'shared'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="shared" id="mode-shared" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Cloud className="h-4 w-4" />
                  VPS Central (Shared)
                </div>
                <p className="text-muted-foreground mt-1 text-sm leading-snug">
                  Município existente na VPS central. Dados preenchidos automaticamente.
                </p>
              </div>
            </div>
          </label>

          <label
            className={`flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
              mode === 'dedicated'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="dedicated" id="mode-dedicated" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Server className="h-4 w-4" />
                  VPS Dedicada
                </div>
                <p className="text-muted-foreground mt-1 text-sm leading-snug">
                  Cliente com infraestrutura própria. Configuração manual completa.
                </p>
              </div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {mode === 'shared' ? (
        <form onSubmit={handleSubmitShared} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city-select">Selecione o Município</Label>
            {loadingAvailable ? (
              <Skeleton className="h-10 w-full" />
            ) : availableCities.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Todos os municípios da VPS central já foram adicionados ao mobile.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                <SelectTrigger id="city-select">
                  <SelectValue placeholder="Escolha um município..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name} - {city.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedCity && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Dados que serão preenchidos automaticamente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>{' '}
                  <strong>{selectedCity.name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Slug:</span>{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5">{selectedCity.slug}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Tenant Code:</span>{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    {selectedCity.id.replace(/-/g, '').slice(0, 8).toUpperCase()}
                  </code>
                </div>
                <div>
                  <span className="text-muted-foreground">API:</span> VPS Central (automático)
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            type="submit"
            disabled={!selectedCityId || submitting || availableCities.length === 0}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              'Adicionar ao Mobile'
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmitDedicated} className="space-y-4">
          <Alert>
            <AlertDescription className="text-xs">
              Preencha todos os dados do município hospedado em VPS dedicada.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="city-name">Nome do Município *</Label>
            <Input
              id="city-name"
              placeholder="Ex: São Paulo"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city-slug">Slug *</Label>
            <Input
              id="city-slug"
              placeholder="Ex: sao-paulo"
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              required
            />
            <p className="text-muted-foreground text-xs">Identificador único em formato kebab-case</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-code">Tenant Code *</Label>
            <Input
              id="tenant-code"
              placeholder="Ex: SP001"
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
              required
            />
            <p className="text-muted-foreground text-xs">Código único do tenant (maiúsculas)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-url">URL da API *</Label>
            <Input
              id="api-url"
              type="url"
              placeholder="https://api.cliente.com.br"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              required
            />
            <p className="text-muted-foreground text-xs">URL base da API do cliente</p>
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              'Adicionar ao Mobile'
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
