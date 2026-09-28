import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  InstrumentPickerModal,
  type InstrumentPickerItem,
  type InstrumentPickerSeriesOption,
} from "./InstrumentPickerModal";

export interface InstrumentPickerFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  items: InstrumentPickerItem[];
  /** Lista exibida no modal (se omitida, usa `items`). */
  modalItems?: InstrumentPickerItem[];
  seriesOptions?: InstrumentPickerSeriesOption[];
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  modalTitle: string;
  allowAll?: boolean;
  allLabel?: string;
  emptyMessage?: string;
  className?: string;
  onModalFiltersChange?: (filters: { serieFiltro: string; nome: string }) => void;
  /** Recarrega a lista com os filtros atuais da página ao abrir o modal. */
  onModalOpen?: () => void;
  modalLoading?: boolean;
  contextLines?: string[];
  contextRequiredMessage?: string;
  multiple?: boolean;
}

function parseSelectedIds(value: string): string[] {
  if (!value || value === "all") return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function InstrumentPickerField({
  id,
  label,
  value,
  onChange,
  items,
  modalItems,
  seriesOptions,
  disabled = false,
  loading = false,
  placeholder = "Selecione",
  modalTitle,
  allowAll = false,
  allLabel = "Todas",
  emptyMessage,
  className,
  onModalFiltersChange,
  onModalOpen,
  modalLoading = false,
  contextLines,
  contextRequiredMessage,
  multiple = false,
}: InstrumentPickerFieldProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (disabled || loading) return;
    onModalOpen?.();
    setOpen(true);
  };

  const labelPool = modalItems?.length ? [...items, ...modalItems] : items;
  const selectedIds = parseSelectedIds(value);
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((selectedId) => labelPool.find((item) => item.id === selectedId))
        .filter((item): item is InstrumentPickerItem => Boolean(item)),
    [labelPool, selectedIds]
  );

  const selectedLabel =
    value === "all" && allowAll
      ? allLabel
      : selectedItems.length === 1
        ? selectedItems[0].label
        : undefined;

  const handleRemove = (idToRemove: string) => {
    const next = selectedIds.filter((selectedId) => selectedId !== idToRemove);
    onChange(next.length > 0 ? next.join(",") : allowAll ? "all" : "");
  };

  const triggerDisabled = disabled || loading;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      {multiple ? (
        <div className="space-y-2">
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={modalTitle}
            disabled={triggerDisabled}
            onClick={handleOpen}
            className="h-10 w-full min-w-0 justify-between px-3 font-normal"
          >
            <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
              {loading
                ? "Carregando..."
                : selectedItems.length > 0
                  ? "Adicionar ou alterar seleção"
                  : value === "all" && allowAll
                    ? allLabel
                    : placeholder}
            </span>
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
          {selectedItems.length > 0 && (
            <ul className="space-y-1.5">
              {selectedItems.map((item, index) => (
                <li
                  key={item.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
                >
                  <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={item.label}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remover ${item.label}`}
                    onClick={() => handleRemove(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={triggerDisabled}
          onClick={handleOpen}
          className={cn(
            "w-full min-w-0 justify-between font-normal h-10 px-3",
            !selectedLabel && value !== "all" && "text-muted-foreground"
          )}
        >
          <span className="truncate text-left flex-1">
            {loading ? "Carregando..." : selectedLabel || placeholder}
          </span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      )}

      <InstrumentPickerModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        items={modalItems ?? items}
        value={value}
        onSelect={onChange}
        multiple={multiple}
        seriesOptions={seriesOptions}
        loading={modalLoading}
        emptyMessage={emptyMessage}
        allowAll={allowAll}
        allLabel={allLabel}
        onFiltersChange={onModalFiltersChange}
        contextLines={contextLines}
        contextRequiredMessage={contextRequiredMessage}
      />
    </div>
  );
}
