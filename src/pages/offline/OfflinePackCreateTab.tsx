import { useState } from 'react';
import { CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  buildScopePayload,
  getOfflinePackApiError,
  registerOfflinePack,
  type RegisterOfflinePackResponse,
} from '@/services/mobile/offlinePackApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatExpiresAt } from './offlinePackShared';
import { OfflinePackScopeForm } from './OfflinePackScopeForm';
import { OfflinePackLocationCard } from './OfflinePackLocationCard';
import { OfflinePackValidityCard } from './OfflinePackValidityCard';
import type { useOfflinePackForm } from './useOfflinePackForm';

interface OfflinePackCreateTabProps {
  form: ReturnType<typeof useOfflinePackForm>;
  onCreated?: (data: RegisterOfflinePackResponse) => void;
}

export function OfflinePackCreateTab({ form, onCreated }: OfflinePackCreateTabProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterOfflinePackResponse | null>(null);

  const {
    isAdmin,
    hasCityContext,
    cityIdForAdminHeader,
    canSubmit,
    scopeMode,
    selections,
    ttlHours,
    setTtlHours,
    maxRedemptions,
    setMaxRedemptions,
  } = form;

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copiado', description: `${label} copiado para a área de transferência.` });
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Copie manualmente o texto exibido.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const scope = buildScopePayload(scopeMode, selections);
      const data = await registerOfflinePack(
        { 
          scope, 
          ttl_hours: ttlHours, 
          max_redemptions: maxRedemptions,
          content_type: {
            include_tests: form.includeTests,
            include_gabaritos: form.includeGabaritos,
            include_forms: form.includeForms,
          },
        },
        cityIdForAdminHeader
      );
      setResult(data);
      toast({
        title: 'Código gerado',
        description: 'Compartilhe o QR ou o código apenas com quem deve usar no aplicativo.',
      });
      onCreated?.(data);
    } catch (err: unknown) {
      toast({
        title: 'Falha ao gerar',
        description: getOfflinePackApiError(
          err,
          'Não foi possível gerar o código. Verifique suas permissões e tente novamente.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <OfflinePackLocationCard
        states={form.states}
        cities={form.cities}
        selectedStateId={form.selectedStateId}
        onStateChange={form.setSelectedStateId}
        selectedCityId={form.selectedCityId}
        onCityChange={form.setSelectedCityId}
        loadingStates={form.loadingStates}
        loadingCities={form.loadingCities}
      />
      <OfflinePackScopeForm form={form} />
      <OfflinePackValidityCard
        ttlHours={ttlHours}
        onTtlChange={setTtlHours}
        maxRedemptions={maxRedemptions}
        onMaxRedemptionsChange={setMaxRedemptions}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" disabled={!canSubmit || submitting} size="lg" className="min-w-[200px]">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando…
            </>
          ) : (
            'Gerar código'
          )}
        </Button>
        {!hasCityContext && (
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? 'Como administrador, selecione estado e município antes de gerar o código.'
              : 'Selecione o município ou aguarde o carregamento do município da sua conta.'}
          </p>
        )}
      </div>

      {result && (
        <>
          <Separator />
          <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900 dark:text-emerald-100">
                <CheckCircle2 className="h-5 w-5" />
                Código gerado com sucesso
              </CardTitle>
              <CardDescription>
                Peça para o usuário do app inserir este código na tela de modo offline. O mesmo código
                permanece após edições futuras do pacote.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.qr_code_data_url && (
                <div className="flex flex-col items-center gap-2 sm:items-start">
                  <Label>QR Code</Label>
                  <img
                    src={result.qr_code_data_url}
                    alt={`QR Code do código ${result.code}`}
                    width={160}
                    height={160}
                    className="rounded-lg border bg-white p-1"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Código</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="bg-background rounded-lg border px-4 py-3 text-lg font-semibold tracking-widest">
                    {result.code}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyText('Código', result.code)}
                    aria-label="Copiar código"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Expira em</p>
                  <p className="font-medium">{formatExpiresAt(result.expires_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Resgates máx.</p>
                  <p className="font-medium">{result.max_redemptions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </form>
  );
}
