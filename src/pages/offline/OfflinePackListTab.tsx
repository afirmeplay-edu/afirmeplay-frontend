import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  bulkDeleteOfflinePacks,
  deleteOfflinePack,
  getOfflinePackApiError,
  listOfflinePacks,
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
import type { useOfflinePackForm } from './useOfflinePackForm';

interface OfflinePackListTabProps {
  form: ReturnType<typeof useOfflinePackForm>;
  refreshToken?: number;
}

export function OfflinePackListTab({ form, refreshToken = 0 }: OfflinePackListTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<OfflinePackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<OfflinePackItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { hasCityContext, cityIdForAdminHeader, isAdmin } = form;

  const fetchList = useCallback(async () => {
    if (!hasCityContext) {
      setItems([]);
      setSelectedIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const data = await listOfflinePacks(true, cityIdForAdminHeader);
      setItems(data.items ?? []);
      setSelectedIds((prev) => {
        const allowed = new Set((data.items ?? []).map((i) => i.offline_pack_id));
        return new Set([...prev].filter((id) => allowed.has(id)));
      });
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

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((i) => i.offline_pack_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
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
    navigate(`/app/modo-offline/${item.offline_pack_id}/editar`, {
      state: { cityId: form.effectiveCityIdForQuery },
    });
  };

  const handleDeleteOne = async () => {
    if (!deleteTarget) return;
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
        description: getOfflinePackApiError(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const selectedIdsList = useMemo(() => [...selectedIds], [selectedIds]);

  const handleBulkDelete = async () => {
    if (selectedIdsList.length === 0) return;
    setDeleting(true);
    try {
      const result = await bulkDeleteOfflinePacks(selectedIdsList, cityIdForAdminHeader);
      const deletedCount = result.deleted?.length ?? 0;
      const notFoundCount = result.not_found?.length ?? 0;

      if (deletedCount > 0) {
        toast({
          title: deletedCount === 1 ? 'Código excluído' : `${deletedCount} códigos excluídos`,
          description:
            notFoundCount > 0
              ? `${notFoundCount} não foram encontrados e podem já ter sido removidos.`
              : undefined,
        });
      } else if (notFoundCount > 0) {
        toast({
          title: 'Nenhum código excluído',
          description: 'Os itens selecionados não foram encontrados.',
          variant: 'destructive',
        });
      }

      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      await fetchList();
    } catch (err: unknown) {
      toast({
        title: 'Não foi possível excluir',
        description: getOfflinePackApiError(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const deleteDialogCode = deleteTarget?.code ?? 'sem código exibido';

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
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) => toggleSelectAll(c === true)}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead>Resgates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.offline_pack_id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(item.offline_pack_id)}
                          onCheckedChange={(c) =>
                            toggleSelect(item.offline_pack_id, c === true)
                          }
                          aria-label={`Selecionar ${item.code ?? item.offline_pack_id}`}
                        />
                      </TableCell>
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
                            onClick={() => goEdit(item)}
                            aria-label="Editar pacote"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
