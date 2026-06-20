import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RelatorioConsolidadoItensModal,
  type RelatorioConsolidadoItemOption,
} from './RelatorioConsolidadoItensModal';

type RelatorioConsolidadoItensPickerProps = {
  label?: string;
  items: RelatorioConsolidadoItemOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  modalTitle: string;
  entityLabel?: string;
  emptyMessage?: string;
  className?: string;
};

export function RelatorioConsolidadoItensPicker({
  label,
  items,
  selected,
  onChange,
  disabled = false,
  loading = false,
  placeholder = 'Selecione',
  modalTitle,
  entityLabel = 'itens',
  emptyMessage,
  className,
}: RelatorioConsolidadoItensPickerProps) {
  const [open, setOpen] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.includes(item.id)),
    [items, selected]
  );

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(selected.filter((x) => x !== id));
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || loading}
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] h-auto justify-between font-normal py-2 px-3"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0 text-left">
          {loading ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : selectedItems.length > 0 ? (
            <>
              {selectedItems.slice(0, 2).map((item) => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="text-xs max-w-[140px] truncate font-normal"
                  title={item.titulo}
                >
                  <span className="truncate">{item.titulo}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => handleRemove(item.id, e)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                </Badge>
              ))}
              {selectedItems.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{selectedItems.length - 2}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {selected.length > 0 && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {selected.length}
            </Badge>
          )}
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </div>
      </Button>

      <RelatorioConsolidadoItensModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        items={items}
        selected={selected}
        onChange={onChange}
        loading={loading}
        emptyMessage={emptyMessage}
        entityLabel={entityLabel}
      />
    </div>
  );
}
