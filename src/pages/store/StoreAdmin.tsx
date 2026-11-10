import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { storeAdminApi } from '@/services/store/storeAdminService';
import type { StoreItemAdmin } from '@/types/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatCoins } from '@/utils/coins';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, ShoppingBag, Loader2, Layers, Sparkles, Shield, Palette, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStoreIcon, getStoreIconGradient } from '@/constants/storeIcons';

const SCOPE_LABELS: Record<string, string> = {
  system: 'Todo o sistema',
  city: 'Município',
  school: 'Escola',
  class: 'Turma',
};

const CATEGORY_LABELS: Record<string, string> = {
  frame: 'Moldura',
  stamp: 'Selo',
  sidebar_theme: 'Tema do menu',
  physical: 'Físico',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  frame: Sparkles,
  stamp: Shield,
  sidebar_theme: Palette,
  physical: Gift,
};

export default function StoreAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<StoreItemAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState<boolean | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<StoreItemAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cityId, setCityId] = useState<string | null>(null);

  const allowedRoles = ['admin', 'tecadm', 'diretor', 'coordenador', 'professor'];
  const canAccess = user?.role && allowedRoles.includes(user.role);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await storeAdminApi.getAdminItems(activeOnly, cityId ?? undefined);
      setItems(data.items ?? []);
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number } })?.response;
      if (res?.status === 403) {
        toast({
          title: 'Sem permissão',
          description: 'Você não tem permissão para gerenciar itens da loja.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro ao carregar itens',
          description: 'Tente novamente mais tarde.',
          variant: 'destructive',
        });
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeOnly, cityId, toast]);

  useEffect(() => {
    if (!canAccess) return;
    fetchItems();
  }, [canAccess, fetchItems]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await storeAdminApi.deleteItem(deleteTarget.id, cityId ?? undefined);
      setDeleteTarget(null);
      toast({ title: 'Item excluído com sucesso.' });
      fetchItems();
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { erro?: string } } })?.response;
      if (res?.status === 403) {
        toast({
          title: 'Sem permissão',
          description: 'Você não tem permissão para remover este item.',
          variant: 'destructive',
        });
      } else if (res?.status === 404) {
        toast({
          title: 'Item não encontrado',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro ao excluir',
          description: res?.data?.erro ?? 'Tente novamente.',
          variant: 'destructive',
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!canAccess) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-5xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <CardTitle className="text-xl">Gerenciar itens da loja</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/app/loja/gerenciar/novo')} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar item
            </Button>
            <Button onClick={() => navigate('/app/loja/gerenciar/lote')} variant="outline">
              <Layers className="h-4 w-4 mr-2" />
              Adicionar em lote
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Mostrar:</span>
              <Select
                value={activeOnly === undefined ? 'all' : activeOnly ? 'active' : 'inactive'}
                onValueChange={(v) =>
                  setActiveOnly(v === 'all' ? undefined : v === 'active')
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Apenas ativos</SelectItem>
                  <SelectItem value="inactive">Apenas inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum item para gerenciar</p>
              <p className="text-sm mt-1">Adicione o primeiro item da loja.</p>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => navigate('/app/loja/gerenciar/novo')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar item
                </Button>
                <Button variant="outline" onClick={() => navigate('/app/loja/gerenciar/lote')}>
                  <Layers className="h-4 w-4 mr-2" />
                  Adicionar em lote
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Ícone</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Ordem</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const CustomIcon = getStoreIcon(item.icon ?? '');
                    const IconComponent = CustomIcon ?? (CATEGORY_ICONS[item.category] ?? Gift);
                    const iconColorKey = item.category === 'sidebar_theme' && item.reward_data
                      ? item.reward_data
                      : (item.icon_color ?? 'amber');
                    const iconGradient = getStoreIconGradient(iconColorKey);
                    return (
                    <TableRow key={item.id}>
                      <TableCell className="w-12 p-2">
                        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br shrink-0', iconGradient)}>
                          <IconComponent className="h-4 w-4 text-white" />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCoins(item.price)} AC
                      </TableCell>
                      <TableCell>
                        {SCOPE_LABELS[item.scope_type] ?? item.scope_type}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-sm',
                            item.is_active ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                          )}
                        >
                          {item.is_active ? 'Sim' : 'Não'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{item.sort_order}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              navigate(`/app/loja/gerenciar/${item.id}/editar`)
                            }
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(item)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent ariaTitle="Excluir item">
          <DialogHeader>
            <DialogTitle>Excluir item</DialogTitle>
            <DialogDescription>
              Excluir item &quot;{deleteTarget?.name}&quot;? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
