import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Loader2 } from "lucide-react";
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
}: InstrumentPickerFieldProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (disabled || loading) return;
    onModalOpen?.();
    setOpen(true);
  };

  const labelPool = modalItems?.length ? [...items, ...modalItems] : items;
  const selectedLabel =
    value === "all" && allowAll
      ? allLabel
      : labelPool.find((item) => item.id === value)?.label;

  const displayText = selectedLabel || placeholder;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <Button
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || loading}
        onClick={handleOpen}
        className={cn(
          "w-full min-w-0 justify-between font-normal h-10 px-3",
          !selectedLabel && value !== "all" && "text-muted-foreground"
        )}
      >
        <span className="truncate text-left flex-1">
          {loading ? "Carregando..." : displayText}
        </span>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-50" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </Button>

      <InstrumentPickerModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        items={modalItems ?? items}
        value={value}
        onSelect={onChange}
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
