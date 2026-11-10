import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeAdminApi } from '@/services/store/storeAdminService';
import type { StoreItemCreatePayload, StoreScopeType, StoreScopeFilter } from '@/types/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, ShoppingBag, Loader2, Package, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'blue', label: 'Tema azul', rewardData: 'blue' },
  { value: 'green', label: 'Tema verde', rewardData: 'green' },
  { value: 'violet', label: 'Tema violeta', rewardData: 'violet' },
  { value: 'amber', label: 'Tema âmbar', rewardData: 'amber' },
  { value: 'rose', label: 'Tema rosa', rewardData: 'rose' },
  { value: 'dark', label: 'Tema escuro', rewardData: 'dark' },
  { value: 'cyan', label: 'Tema ciano', rewardData: 'cyan' },
  { value: 'indigo', label: 'Tema índigo', rewardData: 'indigo' },
  { value: 'emerald', label: 'Tema esmeralda', rewardData: 'emerald' },
  { value: 'orange', label: 'Tema laranja', rewardData: 'orange' },
  { value: 'fuchsia', label: 'Tema fúcsia', rewardData: 'fuchsia' },
  { value: 'teal', label: 'Tema teal', rewardData: 'teal' },
];

const BATCH_CATEGORIES = [
  { value: 'sidebar_theme', label: 'Tema do menu', icon: Palette },
  { value: 'physical', label: 'Item físico', icon: Package },
];

export interface BatchRow {
  id: string;
  name: string;
  price: number;
  description: string;
  rewardData: string; // theme id for sidebar_theme
}

function newRow(): BatchRow {
  return {
    id: crypto.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    price: 0,
    description: '',
    rewardData: THEME_OPTIONS[0]?.value ?? 'violet',
  };
}

export default function StoreAdminBatchForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [category, setCategory] = useState<string>('sidebar_theme');
  const [rows, setRows] = useState<BatchRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };
  const updateRow = (id: string, patch: Partial<BatchRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scopeType: StoreScopeType = 'system';
    const scopeFilter: StoreScopeFilter | null = null;

    const valid = rows.filter((r) => r.name.trim());
    if (valid.length === 0) {
      toast({ title: 'Adicione pelo menos um item com nome', variant: 'destructive' });
      return;
    }
    const withPrice = valid.filter((r) => typeof r.price === 'number' && r.price >= 0);
    if (withPrice.length !== valid.length) {
      toast({ title: 'Preço inválido em algum item', variant: 'destructive' });
      return;
    }

    setSaving(true);
    let created = 0;
    let failed = 0;
    for (const row of withPrice) {
      const payload: StoreItemCreatePayload = {
        name: row.name.trim(),
        description: row.description?.trim() || null,
        price: row.price,
        category,
        reward_type: category,
        reward_data: category === 'sidebar_theme' ? (row.rewardData?.trim() || null) : null,
        is_physical: category === 'physical',
        scope_type: scopeType,
        scope_filter: scopeFilter,
        is_active: true,
        sort_order: 0,
      };
      try {
        await storeAdminApi.createItem(payload, undefined);
        created++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    if (created > 0) {
      toast({
        title: 'Itens criados',
        description: `${created} item(ns) criado(s)${failed > 0 ? `; ${failed} falha(s).` : '.'}`,
      });
      navigate('/app/loja/gerenciar');
    } else {
      toast({
        title: 'Erro ao criar itens',
        description: failed > 0 ? `Nenhum item foi criado (${failed} falha(s)).` : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/loja/gerenciar')} className="shrink-0 rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Adicionar itens em lote</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie vários itens da mesma categoria de uma vez. Escopo: todo o sistema.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Categoria (todos os itens)
            </CardTitle>
            <p className="text-sm text-muted-foreground">Escolha o tipo de item. Todas as linhas abaixo serão desta categoria.</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-3">
              {BATCH_CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border-2 px-4 py-3 transition-all',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-muted hover:border-primary/50'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Itens a criar</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Preencha cada linha. Nome e preço são obrigatórios.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar linha
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="flex flex-wrap items-end gap-3 rounded-lg border p-4 bg-muted/20"
              >
                <span className="text-xs font-medium text-muted-foreground w-full sm:w-auto">#{index + 1}</span>
                {category === 'sidebar_theme' && (
                  <div className="space-y-1.5 min-w-[140px]">
                    <Label className="text-xs">Tema</Label>
                    <Select
                      value={row.rewardData || THEME_OPTIONS[0]?.value}
                      onValueChange={(v) => updateRow(row.id, { rewardData: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {THEME_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5 flex-1 min-w-[120px]">
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="Ex.: Tema azul"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5 w-[100px]">
                  <Label className="text-xs">Preço *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={row.price === 0 ? '' : row.price}
                    onChange={(e) => updateRow(row.id, { price: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-9"
                  />
                </div>
                {category === 'physical' && (
                  <div className="space-y-1.5 flex-1 min-w-[180px]">
                    <Label className="text-xs">Descrição (opcional)</Label>
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      placeholder="Breve descrição"
                      className="h-9"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length <= 1}
                  className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                  aria-label="Remover linha"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/app/loja/gerenciar')} className="sm:min-w-[120px]">
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 sm:min-w-[200px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4 mr-2" />
                Criar {rows.length} item(ns) na loja
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
