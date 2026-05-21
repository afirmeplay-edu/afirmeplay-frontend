import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Loader2, Pencil, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  bulkDeleteOfflinePacks,
  deleteOfflinePack,
  getOfflinePackApiError,
  getOfflinePackQrCode,
  listOfflinePacks,
  OFFLINE_PACK_DELETE_FORBIDDEN_MESSAGE,
  OFFLINE_PACK_QR_LEGACY_MESSAGE,
  type BulkDeleteOfflinePacksResponse,
  type OfflinePackItem,
} from '@/services/mobile/offlinePackApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatExpiresAt, scopeSummary } from './offlinePackShared';
import { OfflinePackLocationCard } from './OfflinePackLocationCard';
import { OfflinePackQrDialog } from './OfflinePackQrDialog';
import type { useOfflinePackForm } from './useOfflinePackForm';

interface OfflinePackListTabProps {
  form: ReturnType<typeof useOfflinePackForm>;
  refreshToken?: number;
}

function summarizeBulkDelete(result: BulkDeleteOfflinePacksResponse) {
  const deleted = result.deleted?.length ?? 0;
  const notFound = result.not_found?.length ?? 0;
  const forbidden = result.forbidden?.length ?? 0;
  const lines: string[] = [];
  if (deleted > 0) lines.push(`${deleted} excluído(s) com sucesso.`);
  if (forbidden > 0) lines.push(`${forbidden} sem permissão para excluir.`);
  if (notFound > 0) lines.push(`${notFound} não encontrado(s) neste município.`);
  return { deleted, notFound, forbidden, lines };
}

export function OfflinePackListTab({ form, refreshToken = 0 }: OfflinePackListTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<OfflinePackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<OfflinePackItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const { hasCityContext, cityIdForAdminHeader, isAdmin } = form;

  const deletableItems = useMemo(() => items.filter((i) => i.can_delete === true), [items]);

  const fetchList = useCallback(async () => {
    if (!hasCityContext) {
      setItems([]);
      setSelectedIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const data = await listOfflinePacks(true, cityIdForAdminHeader);
      const list = data.items ?? [];
      setItems(list);
      const deletableIds = new Set(
        list.filter((i) => i.can_delete === true).map((i) => i.offline_pack_id)
      );
      setSelectedIds((prev) => new Set([...prev].filter((id) => deletableIds.has(id))));
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar códigos',
        description: getOfflinePackApiError(err, 'Tente novamente mais tarde.'),
        variant: 'destructive',
      });
      setItems([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [hasCityContext, cityIdForAdminHeader, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshToken]);

  const allDeletableSelected =
    deletableItems.length > 0 &&
    deletableItems.every((i) => selectedIds.has(i.offline_pack_id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(deletableItems.map((i) => i.offline_pack_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (item: OfflinePackItem, checked: boolean) => {
    if (!item.can_delete) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(item.offline_pack_id);
      else next.delete(item.offline_pack_id);
      return next;
    });
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Copiado', description: 'Código copiado.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const goEdit = (item: OfflinePackItem) => {
    if (!item.can_edit) return;
    navigate(`/app/modo-offline/${item.offline_pack_id}/editar`, {
      state: { cityId: form.effectiveCityIdForQuery },
    });
  };

  const openQrDialog = async (item: OfflinePackItem) => {
    if (!item.code) {
      toast({
        title: 'QR indisponível',
        description: OFFLINE_PACK_QR_LEGACY_MESSAGE,
        variant: 'destructive',
      });
      return;
    }
    setQrDialogOpen(true);
    setQrLoading(true);
    setQrCode(item.code);
    setQrDataUrl(null);
    try {
      const data = await getOfflinePackQrCode(item.offline_pack_id, cityIdForAdminHeader);
      setQrCode(data.code);
      setQrDataUrl(data.qr_code_data_url);
    } catch (err: unknown) {
      setQrDialogOpen(false);
      const ax = err as { response?: { status?: number } };
      const isLegacy = ax.response?.status === 400;
      toast({
        title: 'Não foi possível gerar o QR',
        description: getOfflinePackApiError(
          err,
          isLegacy ? OFFLINE_PACK_QR_LEGACY_MESSAGE : 'Tente novamente mais tarde.'
        ),
        variant: 'destructive',
      });
    } finally {
      setQrLoading(false);
    }
  };

  const handleQrDialogOpenChange = (open: boolean) => {
    setQrDialogOpen(open);
    if (!open) {
      setQrCode(null);
      setQrDataUrl(null);
      setQrLoading(false);
    }
  };

  const handleDeleteOne = async () => {
    if (!deleteTarget?.can_delete) return;
    setDeleting(true);
    try {
      await deleteOfflinePack(deleteTarget.offline_pack_id, cityIdForAdminHeader);
      toast({ title: 'Código excluído', description: 'O pacote foi removido com sucesso.' });
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.offline_pack_id);
        return next;
      });
      await fetchList();
    } catch (err: unknown) {
      toast({
        title: 'Não foi possível excluir',
        description: getOfflinePackApiError(
          err,
          'Tente novamente.',
          OFFLINE_PACK_DELETE_FORBIDDEN_MESSAGE
        ),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const selectedIdsList = useMemo(() => {
    const deletable = new Set(deletableItems.map((i) => i.offline_pack_id));
    return [...selectedIds].filter((id) => deletable.has(id));
  }, [selectedIds, deletableItems]);

  const handleBulkDelete = async () => {
    if (selectedIdsList.length === 0) return;
    setDeleting(true);
    try {
      const result = await bulkDeleteOfflinePacks(selectedIdsList, cityIdForAdminHeader);
      const { deleted, lines } = summarizeBulkDelete(result);

      if (lines.length > 0) {
        toast({
          title:
            deleted > 0
              ? deleted === 1
                ? 'Exclusão concluída'
                : 'Exclusões concluídas'
              : 'Nenhum código excluído',
          description: lines.join(' '),
          variant: deleted > 0 ? 'default' : 'destructive',
        });
      }

      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      await fetchList();
    } catch (err: unknown) {
      toast({
        title: 'Não foi possível excluir',
        description: getOfflinePackApiError(
          err,
          'Tente novamente.',
          OFFLINE_PACK_DELETE_FORBIDDEN_MESSAGE
        ),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const deleteDialogCode = deleteTarget?.code ?? 'sem código exibido';
  const showBulkCheckboxColumn = deletableItems.length > 0;

  return (
    <div className="space-y-6">
      <OfflinePackLocationCard
        states={form.states}
        cities={form.cities}
        selectedStateId={form.selectedStateId}
        onStateChange={form.setSelectedStateId}
        selectedCityId={form.selectedCityId}
        onCityChange={form.setSelectedCityId}
        loadingStates={form.loadingStates}
        loadingCities={form.loadingCities}
        idPrefix="offline-list"
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Códigos gerados</CardTitle>
            <CardDescription>
              Inclui pacotes expirados. O código exibido é o mesmo usado no aplicativo móvel.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {someSelected && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={deleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir ({selectedIds.size})
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchList}
              disabled={!hasCityContext || loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!hasCityContext ? (
            <p className="text-muted-foreground text-sm">
              {isAdmin
                ? 'Selecione estado e município para listar os códigos.'
                : 'Aguarde o carregamento do município vinculado à sua conta.'}
            </p>
          ) : loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum código encontrado para este município.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showBulkCheckboxColumn && (
                      <TableHead className="w-[44px]">
                        <Checkbox
                          checked={allDeletableSelected}
                          onCheckedChange={(c) => toggleSelectAll(c === true)}
                          aria-label="Selecionar todos que podem ser excluídos"
                        />
                      </TableHead>
                    )}
                    <TableHead>Código</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead>Resgates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isMine =
                      user?.id &&
                      item.created_by_user_id &&
                      item.created_by_user_id === user.id;
                    return (
                      <TableRow key={item.offline_pack_id}>
                        {showBulkCheckboxColumn && (
                          <TableCell>
                            {item.can_delete ? (
                              <Checkbox
                                checked={selectedIds.has(item.offline_pack_id)}
                                onCheckedChange={(c) => toggleSelect(item, c === true)}
                                aria-label={`Selecionar ${item.code ?? item.offline_pack_id}`}
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-sm">
                          {item.code ? (
                            <div className="flex items-center gap-1">
                              <span>{item.code}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => copyCode(item.code!)}
                                aria-label="Copiar código"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-sm"
                          title={scopeSummary(item.scope)}
                        >
                          {scopeSummary(item.scope)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatExpiresAt(item.expires_at)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {item.redemptions_count} / {item.max_redemptions}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {isMine && (
                              <Badge variant="outline" className="text-xs">
                                Criado por mim
                              </Badge>
                            )}
                            {item.revoked_at ? (
                              <Badge variant="destructive">Revogado</Badge>
                            ) : item.is_expired ? (
                              <Badge variant="secondary">Expirado</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                              >
                                Ativo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openQrDialog(item)}
                              disabled={!item.code}
                              aria-label={
                                item.code ? 'Ver QR Code do código' : 'QR indisponível para este pacote'
                              }
                              title={item.code ? 'Ver QR Code' : OFFLINE_PACK_QR_LEGACY_MESSAGE}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                            {item.can_edit && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => goEdit(item)}
                                aria-label="Editar pacote"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {item.can_delete && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(item)}
                                aria-label="Excluir pacote"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OfflinePackQrDialog
        open={qrDialogOpen}
        onOpenChange={handleQrDialogOpenChange}
        code={qrCode}
        qrDataUrl={qrDataUrl}
        loading={qrLoading}
        title="QR Code do código"
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir código?</DialogTitle>
            <DialogDescription>
              O código <strong>{deleteDialogCode}</strong> será removido permanentemente. Dispositivos
              que já resgataram não receberão atualizações por este pacote.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteOne} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir {selectedIds.size} código{selectedIds.size !== 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Códigos já usados no aplicativo deixarão de estar
              disponíveis para novos resgates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
