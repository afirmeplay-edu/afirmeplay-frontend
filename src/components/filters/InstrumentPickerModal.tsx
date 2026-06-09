import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Check, Loader2, FileText, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type InstrumentPickerItem = {
  id: string;
  label: string;
  subtitle?: string;
  badge?: string;
  badges?: string[];
};

export type InstrumentPickerSeriesOption = {
  id: string;
  name: string;
};

export interface InstrumentPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: InstrumentPickerItem[];
  value: string;
  onSelect: (id: string) => void;
  seriesOptions?: InstrumentPickerSeriesOption[];
  loading?: boolean;
  emptyMessage?: string;
  allowAll?: boolean;
  allLabel?: string;
  onFiltersChange?: (filters: { serieFiltro: string; nome: string }) => void;
  /** Filtros já escolhidos na página (estado, município, etc.). */
  contextLines?: string[];
  contextRequiredMessage?: string;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function EvaluationCard({
  label,
  badges = [],
  subtitle,
  isSelected,
  onClick,
  icon,
}: {
  label: string;
  badges?: string[];
  subtitle?: string;
  isSelected: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150",
        "bg-card hover:border-primary/45 hover:bg-primary/[0.03]",
        isSelected
          ? "border-primary bg-primary/8 ring-1 ring-primary/30"
          : "border-border/70"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug line-clamp-3">{label}</p>
        {badges.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {badges.map((disciplina) => (
              <Badge
                key={disciplina}
                variant="secondary"
                className="text-xs px-2 py-0.5 font-medium"
              >
                {disciplina}
              </Badge>
            ))}
          </div>
        ) : (
          subtitle && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
          )
        )}
      </div>
      {isSelected && <Check className="h-5 w-5 shrink-0 text-primary mt-0.5" />}
    </button>
  );
}

export function InstrumentPickerModal({
  open,
  onOpenChange,
  title,
  items,
  value,
  onSelect,
  seriesOptions = [],
  loading = false,
  emptyMessage = "Nenhum item encontrado.",
  allowAll = false,
  allLabel = "Todas",
  onFiltersChange,
  contextLines = [],
  contextRequiredMessage = "Selecione estado e município antes de buscar.",
}: InstrumentPickerModalProps) {
  const contextReady = contextLines.length > 0;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const skipFiltersSyncRef = useRef(false);

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      setSelectedSerie("all");
      skipFiltersSyncRef.current = true;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !onFiltersChangeRef.current) return;
    if (skipFiltersSyncRef.current) {
      skipFiltersSyncRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      onFiltersChangeRef.current?.({
        serieFiltro: selectedSerie,
        nome: searchTerm.trim(),
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, searchTerm, selectedSerie]);

  const filteredItems = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    let list = items;
    if (term) {
      list = list.filter(
        (item) =>
          item.label.toLowerCase().includes(term) ||
          (item.subtitle?.toLowerCase().includes(term) ?? false) ||
          (item.badge?.toLowerCase().includes(term) ?? false) ||
          (item.badges?.some((b) => b.toLowerCase().includes(term)) ?? false)
      );
    }
    return [...list].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [items, searchTerm]);

  const handleSelect = (id: string) => {
    onSelect(id);
    onOpenChange(false);
  };

  const totalCount = filteredItems.length + (allowAll ? 1 : 0);

  const footerSummary = useMemo(() => {
    if (!contextReady || loading) return null;
    if (searchTerm.trim()) {
      const n = filteredItems.length;
      const total = items.length;
      return n === 1 ? `1 de ${total} exibida` : `${n} de ${total} exibidas`;
    }
    if (totalCount === 1) return "1 opção disponível";
    return `${totalCount} opções disponíveis`;
  }, [contextReady, loading, searchTerm, filteredItems.length, items.length, totalCount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(96vh,1100px)] w-[min(98vw,118rem)] max-w-none flex-col gap-0 overflow-hidden p-0 border-primary/20 shadow-2xl data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100">
        <div className="shrink-0 border-b border-primary/15 bg-gradient-to-br from-primary/12 via-primary/6 to-background">
          <DialogHeader className="space-y-0 px-6 pt-5 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
              {!loading && contextReady && (
                <Badge className="shrink-0 bg-primary text-primary-foreground">
                  {items.length} {items.length === 1 ? "avaliação" : "avaliações"}
                </Badge>
              )}
            </div>
            {contextLines.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1.5">
                {contextLines.map((line) => (
                  <Badge
                    key={line}
                    variant="outline"
                    className="border-primary/25 bg-background/80 text-[10px] font-normal"
                  >
                    {line}
                  </Badge>
                ))}
              </div>
            )}
          </DialogHeader>

          <div className="px-6 pb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70" />
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!contextReady}
                className="h-11 pl-10 text-base border-primary/20 bg-background/90"
              />
            </div>
            {seriesOptions.length > 0 && (
              <Select value={selectedSerie} onValueChange={setSelectedSerie} disabled={!contextReady}>
                <SelectTrigger className="h-11 w-full sm:w-[240px] text-base border-primary/20 bg-background/90">
                  <Layers className="h-4 w-4 mr-2 text-primary/70 shrink-0" />
                  <SelectValue placeholder="Todas as séries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as séries</SelectItem>
                  {seriesOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/15 px-6 py-4">
          {!contextReady ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground max-w-sm">{contextRequiredMessage}</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm">Carregando avaliações...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {allowAll && (
                <EvaluationCard
                  label={allLabel}
                  subtitle="Incluir todos do recorte"
                  isSelected={value === "all"}
                  onClick={() => handleSelect("all")}
                  icon={<Layers className="h-4 w-4" />}
                />
              )}

              {filteredItems.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <EvaluationCard
                    key={item.id}
                    label={item.label}
                    badges={item.badges ?? (item.badge ? [item.badge] : [])}
                    subtitle={item.subtitle}
                    isSelected={value === item.id}
                    onClick={() => handleSelect(item.id)}
                    icon={<FileText className="h-4 w-4" />}
                  />
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-background px-6 py-3">
          <span className="mr-auto text-sm text-muted-foreground">{footerSummary}</span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
