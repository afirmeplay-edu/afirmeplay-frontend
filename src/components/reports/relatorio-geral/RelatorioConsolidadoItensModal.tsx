import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Check, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RelatorioConsolidadoItemOption = {
  id: string;
  titulo: string;
  disciplinas?: string[];
};

type RelatorioConsolidadoItensModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: RelatorioConsolidadoItemOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  emptyMessage?: string;
  entityLabel?: string;
};

function ItemCard({
  titulo,
  disciplinas = [],
  isSelected,
  disabled,
  onClick,
}: {
  titulo: string;
  disciplinas?: string[];
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150',
        'bg-card hover:border-primary/45 hover:bg-primary/[0.03]',
        disabled && 'opacity-50 cursor-not-allowed hover:border-border/70 hover:bg-card',
        isSelected
          ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
          : 'border-border/70'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug line-clamp-3">{titulo}</p>
        {disciplinas.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {disciplinas.map((disc) => (
              <Badge key={disc} variant="secondary" className="text-xs px-2 py-0.5 font-medium">
                {disc}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {isSelected && <Check className="h-5 w-5 shrink-0 text-primary mt-0.5" />}
    </button>
  );
}

export function RelatorioConsolidadoItensModal({
  open,
  onOpenChange,
  title,
  items,
  selected,
  onChange,
  loading = false,
  emptyMessage = 'Nenhum item encontrado.',
  entityLabel = 'itens',
}: RelatorioConsolidadoItensModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => {
    if (open) {
      setSearchTerm('');
      setDraft(selected);
    }
  }, [open, selected]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list = items;
    if (term) {
      list = items.filter(
        (item) =>
          item.titulo.toLowerCase().includes(term) ||
          item.disciplinas?.some((d) => d.toLowerCase().includes(term))
      );
    }
    return [...list].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [items, searchTerm]);

  const toggleItem = (id: string) => {
    setDraft((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredItems.map((i) => i.id);
    setDraft((prev) => {
      const merged = [...prev];
      for (const id of visibleIds) {
        if (!merged.includes(id)) merged.push(id);
      }
      return merged;
    });
  };

  const handleConfirm = () => {
    onChange(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,900px)] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 border-primary/20 shadow-2xl">
        <div className="shrink-0 border-b border-primary/15 bg-gradient-to-br from-primary/12 via-primary/6 to-background">
          <DialogHeader className="space-y-0 px-6 pt-5 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
              {!loading && (
                <Badge variant="outline" className="shrink-0 border-primary/25 bg-background/80">
                  {items.length} disponíve{items.length === 1 ? 'l' : 'is'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground pt-1">
              Selecione os {entityLabel} desejados. {draft.length} selecionado(s).
            </p>
          </DialogHeader>

          <div className="px-6 pb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou disciplina..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 pl-10 border-primary/20 bg-background"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 border-primary/20"
              disabled={loading || filteredItems.length === 0}
              onClick={handleSelectAllVisible}
            >
              Selecionar visíveis
            </Button>
            {draft.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-11 shrink-0"
                onClick={() => setDraft([])}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/15 px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm">Carregando…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isSelected = draft.includes(item.id);
                return (
                  <ItemCard
                    key={item.id}
                    titulo={item.titulo}
                    disciplinas={item.disciplinas}
                    isSelected={isSelected}
                    disabled={false}
                    onClick={() => toggleItem(item.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-background px-6 py-3">
          <span className="mr-auto text-sm text-muted-foreground">
            {draft.length} selecionado(s)
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={draft.length === 0}>
            Confirmar seleção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
