import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Copy, Loader2, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  buildScopePayload,
  getOfflinePack,
  getOfflinePackApiError,
  OFFLINE_PACK_EDIT_FORBIDDEN_MESSAGE,
  patchOfflinePack,
  type OfflinePackItem,
} from '@/services/mobile/offlinePackApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatExpiresAt } from './offlinePackShared';
import { OfflinePackLocationCard } from './OfflinePackLocationCard';
import { OfflinePackScopeForm } from './OfflinePackScopeForm';
import { OfflinePackValidityCard } from './OfflinePackValidityCard';
import { useOfflinePackForm } from './useOfflinePackForm';

type LocationState = { cityId?: string };

export default function OfflinePackEditPage() {
  const { offline_pack_id: packId } = useParams<{ offline_pack_id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';
  const cityIdFromNav = (location.state as LocationState | null)?.cityId;
  const cityIdForAdmin = isAdmin ? cityIdFromNav : undefined;

  const [pack, setPack] = useState<OfflinePackItem | null>(null);
  const [loadingPack, setLoadingPack] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSavedDialog, setShowSavedDialog] = useState(false);

  useEffect(() => {
    if (!packId) return;
    let cancelled = false;
    setLoadingPack(true);
    (async () => {
      try {
        const data = await getOfflinePack(packId, cityIdForAdmin);
        if (!cancelled) setPack(data);
      } catch (err: unknown) {
        if (!cancelled) {
          toast({
            title: 'Pacote não encontrado',
            description: getOfflinePackApiError(err, 'Não foi possível carregar o pacote.'),
            variant: 'destructive',
          });
          navigate('/app/modo-offline', { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingPack(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId, cityIdForAdmin, navigate, toast]);

  if (loadingPack || !pack) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const initialCityId = cityIdFromNav ?? (user?.role !== 'admin' ? user?.tenant_id : undefined);

  return (
    <OfflinePackEditForm
      pack={pack}
      packId={packId!}
      initialCityId={initialCityId}
      saving={saving}
      setSaving={setSaving}
      setPack={setPack}
      showSavedDialog={showSavedDialog}
      setShowSavedDialog={setShowSavedDialog}
      navigate={navigate}
      toast={toast}
    />
  );
}

function OfflinePackEditForm({
  pack,
  packId,
  initialCityId,
  saving,
  setSaving,
  setPack,
  showSavedDialog,
  setShowSavedDialog,
  navigate,
  toast,
}: {
  pack: OfflinePackItem;
  packId: string;
  initialCityId?: string;
  saving: boolean;
  setSaving: (v: boolean) => void;
  setPack: (p: OfflinePackItem) => void;
  showSavedDialog: boolean;
  setShowSavedDialog: (v: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const form = useOfflinePackForm({
    initialScope: pack.scope,
    initialContentType: pack.content_type ?? null,
    initialMaxRedemptions: pack.max_redemptions,
    minMaxRedemptions: pack.redemptions_count,
    initialCityId,
  });

  const copyCode = async () => {
    if (!pack.code) return;
    try {
      await navigator.clipboard.writeText(pack.code);
      toast({ title: 'Copiado', description: 'Código copiado.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const canEdit = pack.can_edit === true;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !form.canSubmit) return;

    setSaving(true);
    try {
      const body = {
        scope: buildScopePayload(form.scopeMode, form.selections),
        ttl_hours: form.ttlHours,
        max_redemptions: form.maxRedemptions,
        content_type: {
          include_tests: form.includeTests,
          include_gabaritos: form.includeGabaritos,
          include_forms: form.includeForms,
        },
      };
      const updated = await patchOfflinePack(packId, body, form.cityIdForAdminHeader);
      setPack(updated);
      setShowSavedDialog(true);
    } catch (err: unknown) {
      toast({
        title: 'Falha ao salvar',
        description: getOfflinePackApiError(
          err,
          'Verifique os dados e tente novamente.',
          OFFLINE_PACK_EDIT_FORBIDDEN_MESSAGE
        ),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 pb-16 md:p-6 lg:p-8">
      <header className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link to="/app/modo-offline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Editar pacote offline</h1>
            <p className="text-muted-foreground text-sm">
              O código não muda. Ajuste escopo, validade ou limite de dispositivos.
            </p>
          </div>
        </div>
      </header>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Código (somente leitura)</CardTitle>
          <CardDescription>
            O aplicador continua usando este mesmo código no app. Após alterar o escopo, é necessário
            baixar os dados novamente no aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pack.code ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded-lg border px-4 py-3 text-lg font-semibold tracking-widest">
                {pack.code}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={copyCode} aria-label="Copiar">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Pacote antigo sem código salvo no sistema.</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Expira em: </span>
              <span className="font-medium">{formatExpiresAt(pack.expires_at)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Resgates: </span>
              <span className="font-medium">
                {pack.redemptions_count} / {pack.max_redemptions}
              </span>
            </div>
            {pack.is_expired && <Badge variant="secondary">Expirado</Badge>}
            {pack.revoked_at && <Badge variant="destructive">Revogado</Badge>}
          </div>
        </CardContent>
      </Card>

      {!canEdit && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sem permissão para editar</AlertTitle>
          <AlertDescription>{OFFLINE_PACK_EDIT_FORBIDDEN_MESSAGE}</AlertDescription>
        </Alert>
      )}

      {pack.is_expired && canEdit && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pacote expirado</AlertTitle>
          <AlertDescription>
            Informe novas horas de validade abaixo para renovar. Sem renovar, outras alterações podem
            ser rejeitadas pela API.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <OfflinePackLocationCard
          states={form.states}
          cities={form.cities}
          selectedStateId={form.selectedStateId}
          onStateChange={form.setSelectedStateId}
          selectedCityId={form.selectedCityId}
          onCityChange={form.setSelectedCityId}
          loadingStates={form.loadingStates}
          loadingCities={form.loadingCities}
          idPrefix="offline-edit"
          disabled={!canEdit}
        />
        <OfflinePackScopeForm form={form} readOnly={!canEdit} />
        <OfflinePackValidityCard
          ttlHours={form.ttlHours}
          onTtlChange={form.setTtlHours}
          maxRedemptions={form.maxRedemptions}
          onMaxRedemptionsChange={form.setMaxRedemptions}
          minMaxRedemptions={pack.redemptions_count}
          isExpired={pack.is_expired}
          idPrefix="offline-edit"
          disabled={!canEdit}
        />
        <Button type="submit" disabled={!canEdit || !form.canSubmit || saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            'Salvar alterações'
          )}
        </Button>
      </form>

      <AlertDialog open={showSavedDialog} onOpenChange={setShowSavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações salvas</AlertDialogTitle>
            <AlertDialogDescription>
              O código permanece o mesmo
              {pack.code ? ` (${pack.code})` : ''}. Os aplicadores precisam abrir o app e baixar os
              dados novamente para refletir as alterações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate('/app/modo-offline')}>
              Ir para lista
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
