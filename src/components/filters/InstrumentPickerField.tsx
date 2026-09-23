import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <div
          className={cn(
            "flex w-full min-h-11 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 py-2",
            !triggerDisabled && "cursor-pointer",
            triggerDisabled && "pointer-events-none opacity-50"
          )}
          onClick={handleOpen}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {loading ? (
              <span className="text-sm text-muted-foreground">Carregando...</span>
            ) : selectedItems.length > 0 ? (
              <>
                {selectedItems.slice(0, 2).map((item) => (
                  <Badge
                    key={item.id}
                    variant="secondary"
                    className="gap-1 text-xs max-w-[160px] font-normal"
                    title={item.label}
                  >
                    <span className="truncate">{item.label}</span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-destructive/20"
                      aria-label={`Remover ${item.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemove(item.id);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                {selectedItems.length > 2 && (
                  <Badge variant="outline" className="text-xs tabular-nums">
                    +{selectedItems.length - 2}
                  </Badge>
                )}
              </>
            ) : (
              <span className="truncate text-sm text-muted-foreground">
                {value === "all" && allowAll ? allLabel : placeholder}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selectedItems.length > 0 && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {selectedItems.length}
              </Badge>
            )}
            <Button
              id={id}
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-label={modalTitle}
              disabled={triggerDisabled}
              onClick={handleOpen}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              ) : (
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              )}
            </Button>
          </div>
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
