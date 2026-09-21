import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/authContext";
import {
  ShoppingBag,
  Coins,
  Sparkles,
  Shield,
  Palette,
  Gift,
  Package,
} from "lucide-react";
import { storeApi } from "@/services/store/storeService";
import { getBalance } from "@/services/coinsApi";
import type { StoreItem, StudentPurchase } from "@/types/store";
import { StoreItemCard } from "@/components/Store/StoreItemCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCoins } from "@/utils/coins";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StoreCategory } from "@/types/store";
import { getStoreIcon, getStoreIconGradient } from "@/constants/storeIcons";

const CATEGORY_TABS: { value: '' | StoreCategory; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'frame', label: 'Molduras' },
  { value: 'stamp', label: 'Selos' },
  { value: 'sidebar_theme', label: 'Temas da sidebar' },
  { value: 'physical', label: 'Itens físicos' },
];

const Loja: React.FC = () => {
  const { toast } = useToast();
  const { addOwnedFrame } = useAuth();
  const [category, setCategory] = useState<'' | StoreCategory>('');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<'store' | 'purchases'>('store');
  const [purchases, setPurchases] = useState<StudentPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const value = await getBalance();
      setBalance(value);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance, balanceRefreshKey]);

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const params = category ? { category } : {};
      const { data } = await storeApi.getItems(params);
      setItems(data.items ?? []);
    } catch (err) {
      console.error('Erro ao carregar itens da loja:', err);
      setItems([]);
      toast({
        title: 'Erro ao carregar loja',
        description: 'Não foi possível carregar os itens. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setItemsLoading(false);
    }
  }, [category, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const fetchPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const { data } = await storeApi.getMyPurchases({ limit: 50, offset: 0 });
      setPurchases(data.purchases ?? []);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeMainTab === 'purchases') fetchPurchases();
  }, [activeMainTab, fetchPurchases]);

  const handleComprar = (item: StoreItem) => {
    if (item.already_purchased || (item.requirement && item.requirement_met === false)) return;
    setSelectedItem(item);
  };

  const confirmPurchase = async () => {
    if (!selectedItem) return;
    setPurchasingId(selectedItem.id);
    try {
      const { data } = await storeApi.purchase(selectedItem.id);
      setSelectedItem(null);
      setBalance(data.new_balance);
      setBalanceRefreshKey((k) => k + 1);
      await fetchItems();
      if (data.reward_type === 'frame' && data.reward_data) {
        await addOwnedFrame(data.reward_data);
      }
      toast({
        title: 'Compra realizada!',
        description: `${data.message || 'Item adquirido.'} Novo saldo: ${formatCoins(data.new_balance)} moedas.`,
      });
    } catch (err: unknown) {
      const res = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number; data?: { erro?: string; detalhes?: string } } }).response
        : undefined;
      const status = res?.status;
      const msg = res?.data?.erro ?? res?.data?.detalhes ?? 'Não foi possível concluir a compra.';
      if (status === 400 && (res?.data?.erro?.toLowerCase().includes('saldo') || msg.toLowerCase().includes('saldo'))) {
        toast({
          title: 'Saldo insuficiente',
          description: res?.data?.detalhes || 'Você não tem moedas suficientes para esta compra.',
          variant: 'destructive',
        });
      } else if (status === 404) {
        toast({
          title: 'Item não encontrado',
          description: 'Este item não está mais disponível.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro',
          description: typeof msg === 'string' ? msg : 'Tente novamente mais tarde.',
          variant: 'destructive',
        });
      }
    } finally {
      setPurchasingId(null);
    }
  };

  const currentBalance = balance ?? 0;

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-5xl">
      <Card className="overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-lg">
                <ShoppingBag className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-primary">
                  Loja Afirme Coins
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gaste suas moedas e ganhe itens exclusivos para personalizar sua experiência
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="text-center sm:text-right">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Seu saldo
                </p>
                {balanceLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums text-primary">
                    <Coins className="h-7 w-7" />
                    {formatCoins(currentBalance)}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  to="/aluno/moedas/historico"
                  className="text-primary border-primary hover:bg-primary/10"
                >
                  Ver histórico
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as 'store' | 'purchases')} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="store" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Itens
          </TabsTrigger>
          <TabsTrigger value="purchases" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Minhas compras
          </TabsTrigger>
        </TabsList>

        <TabsContent value="store" className="space-y-4 mt-4">
          <Tabs value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : (v as StoreCategory))} className="w-full">
            <TabsList className="flex flex-wrap gap-1 h-auto p-1.5">
              {CATEGORY_TABS.map((tab) => (
                <TabsTrigger key={tab.value || 'all'} value={tab.value || 'all'} className="text-xs sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {CATEGORY_TABS.map((tab) => (
              <TabsContent key={tab.value || 'all'} value={tab.value || 'all'} className="mt-4">
                {itemsLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-64 rounded-lg" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="font-medium text-foreground">Nenhum item nesta categoria</p>
                      <p className="text-sm text-muted-foreground mt-1">Tente outra categoria ou volte mais tarde.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {items.filter((i) => i.is_active).map((item) => (
                      <StoreItemCard
                        key={item.id}
                        item={item}
                        balance={currentBalance}
                        onPurchase={(id) => handleComprar(items.find((i) => i.id === id)!)}
                        loading={purchasingId === item.id}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4 mt-4">
          {purchasesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="font-medium text-foreground">Nenhuma compra ainda</p>
                <p className="text-sm text-muted-foreground mt-1">Itens comprados na loja aparecerão aqui.</p>
                <Button className="mt-4" variant="outline" onClick={() => setActiveMainTab('store')}>
                  Ir para a loja
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {purchases.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{p.item_name || 'Item'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      <span className="font-semibold tabular-nums">{formatCoins(p.price_paid)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md" ariaTitle="Confirmar compra">
          <DialogHeader>
            <DialogTitle>Confirmar compra</DialogTitle>
            <DialogDescription>
              {selectedItem && (
                <>
                  Você está prestes a gastar{' '}
                  <strong className="text-primary">
                    {formatCoins(selectedItem.price)} AfirmeCoins
                  </strong>{' '}
                  em &quot;{selectedItem.name}&quot;. Deseja continuar?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (() => {
            const CustomIcon = getStoreIcon(selectedItem.icon ?? '');
            const IconComponent = CustomIcon ?? { frame: Sparkles, stamp: Shield, sidebar_theme: Palette, physical: Gift }[selectedItem.category] ?? Gift;
            const iconColorKey = selectedItem.category === 'sidebar_theme' && selectedItem.reward_data
              ? selectedItem.reward_data
              : (selectedItem.icon_color ?? 'amber');
            const iconGradient = getStoreIconGradient(iconColorKey);
            return (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', iconGradient)}>
                  <IconComponent className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{selectedItem.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCoins(selectedItem.price)} AfirmeCoins
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedItem(null)}
              disabled={!!purchasingId}
            >
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={confirmPurchase}
              disabled={!!purchasingId}
            >
              {purchasingId ? 'Processando...' : 'Confirmar compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Loja;
