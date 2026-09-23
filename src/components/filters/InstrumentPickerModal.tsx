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
  gradeId?: string;
  gradeName?: string;
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
  /** Quando true, o usuário marca 2+ provas da mesma série. Default: uma só. */
  multiple?: boolean;
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

function parseSelectedIds(value: string): string[] {
  if (!value || value === "all") return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

function itemDisciplinas(item: InstrumentPickerItem): string[] {
  if (item.badges && item.badges.length > 0) return item.badges;
  return item.badge ? [item.badge] : [];
}

function isMultidisciplinary(item: InstrumentPickerItem): boolean {
  return itemDisciplinas(item).length > 1;
}

function groupDisableReason(
  item: InstrumentPickerItem,
  draftIds: string[],
  items: InstrumentPickerItem[]
): string | undefined {
  if (draftIds.includes(item.id)) return undefined;
  const selected = items.filter((entry) => draftIds.includes(entry.id));
  if (selected.length === 0) return undefined;

  if (selected.some(isMultidisciplinary)) {
    return "Já há uma prova multidisciplinar";
  }
  if (isMultidisciplinary(item)) {
    return "Prova multidisciplinar não entra no grupo";
  }

  const lockedGradeId = selected.find((entry) => entry.gradeId)?.gradeId;
  if (lockedGradeId) {
    if (!item.gradeId) return "Série não informada";
    if (item.gradeId !== lockedGradeId) return "Outra série";
  }

  const selectedDisciplinas = new Set(selected.flatMap(itemDisciplinas));
  if (itemDisciplinas(item).some((disciplina) => selectedDisciplinas.has(disciplina))) {
    return "Disciplina já selecionada";
  }
  return undefined;
}

function EvaluationCard({
  label,
  badges = [],
  subtitle,
  isSelected,
  onClick,
  icon,
  disabled,
  disabledReason,
}: {
  label: string;
  badges?: string[];
  subtitle?: string;
  isSelected: boolean;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150",
        "bg-card hover:border-primary/45 hover:bg-primary/[0.03]",
        isSelected
          ? "border-primary bg-primary/8 ring-1 ring-primary/30"
          : "border-border/70",
        disabled && "cursor-not-allowed opacity-55 hover:border-border/70 hover:bg-card"
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
        {disabled && disabledReason && (
          <p className="mt-1.5 text-xs text-muted-foreground">{disabledReason}</p>
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
  multiple = false,
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
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [draftAll, setDraftAll] = useState(false);
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const skipFiltersSyncRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSearchTerm("");
    skipFiltersSyncRef.current = true;
    if (multiple) {
      const ids = parseSelectedIds(value);
      setDraftIds(ids);
      setDraftAll(value === "all");
      const first = items.find((item) => ids.includes(item.id) && item.gradeId);
      setSelectedSerie(first?.gradeId ?? "all");
    } else {
      setDraftIds([]);
      setDraftAll(false);
      setSelectedSerie("all");
    }
    // Só reinicia o rascunho ao abrir. Recarregar a lista no modal não deve apagar a busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const selectedDraftItems = useMemo(
    () => items.filter((item) => draftIds.includes(item.id)),
    [items, draftIds]
  );
  const lockedGrade = selectedDraftItems.find((item) => item.gradeId);
  const lockedGradeName = lockedGrade?.gradeName;

  useEffect(() => {
    if (!open || !multiple || !lockedGrade?.gradeId) return;
    if (selectedSerie !== lockedGrade.gradeId) {
      setSelectedSerie(lockedGrade.gradeId);
    }
  }, [open, multiple, lockedGrade?.gradeId, selectedSerie]);

  const handleSingleSelect = (id: string) => {
    onSelect(id);
    onOpenChange(false);
  };

  const toggleDraft = (id: string) => {
    const added = items.find((item) => item.id === id);
    setDraftAll(false);
    setDraftIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((entry) => entry !== id);
        if (next.length === 0) setSelectedSerie("all");
        return next;
      }
      const reason = added ? groupDisableReason(added, current, items) : "Prova indisponível";
      if (reason) return current;
      if (current.length === 0 && added?.gradeId) {
        setSelectedSerie(added.gradeId);
      }
      return [...current, id];
    });
  };

  const selectAllDraft = () => {
    setDraftAll(true);
    setDraftIds([]);
    setSelectedSerie("all");
  };

  const clearGradeLock = () => {
    setDraftIds([]);
    setDraftAll(false);
    setSelectedSerie("all");
  };

  const confirmMultiple = () => {
    if (draftAll || (draftIds.length === 0 && allowAll)) {
      onSelect("all");
    } else if (draftIds.length === 0) {
      onSelect("");
    } else {
      onSelect(draftIds.join(","));
    }
    onOpenChange(false);
  };

  const confirmLabel = draftAll
    ? `Usar ${allLabel.toLowerCase()}`
    : draftIds.length >= 2
      ? `Juntar ${draftIds.length} provas`
      : draftIds.length === 1
        ? "Usar esta prova"
        : allowAll
          ? `Usar ${allLabel.toLowerCase()}`
          : "Confirmar";

  const totalCount = filteredItems.length + (allowAll ? 1 : 0);

  const footerSummary = useMemo(() => {
    if (!contextReady || loading) return null;
    if (multiple && !draftAll && draftIds.length > 0) {
      return draftIds.length === 1
        ? "1 prova selecionada"
        : `${draftIds.length} provas selecionadas`;
    }
    if (searchTerm.trim()) {
      const n = filteredItems.length;
      const total = items.length;
      return n === 1 ? `1 de ${total} exibida` : `${n} de ${total} exibidas`;
    }
    if (totalCount === 1) return "1 opção disponível";
    return `${totalCount} opções disponíveis`;
  }, [
    contextReady,
    loading,
    multiple,
    draftAll,
    draftIds.length,
    searchTerm,
    filteredItems.length,
    items.length,
    totalCount,
  ]);

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
              <label htmlFor="instrument-picker-search" className="sr-only">
                Buscar avaliação
              </label>
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70" />
              <Input
                id="instrument-picker-search"
                type="search"
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!contextReady}
                autoComplete="off"
                spellCheck={false}
                className="h-11 pl-10 text-base border-primary/20 bg-background/90"
              />
            </div>
            {seriesOptions.length > 0 && (
              <Select
                value={selectedSerie}
                onValueChange={setSelectedSerie}
                disabled={!contextReady || Boolean(lockedGrade?.gradeId)}
              >
                <SelectTrigger
                  aria-label="Filtrar por série"
                  className="h-11 w-full sm:w-[240px] text-base border-primary/20 bg-background/90"
                >
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

        {multiple && lockedGradeName && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 bg-primary/5 px-6 py-2.5">
            <p className="text-sm text-foreground">
              Série travada: <span className="font-medium">{lockedGradeName}</span>. Só provas desta série.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={clearGradeLock}>
              Liberar série
            </Button>
          </div>
        )}

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
                  isSelected={multiple ? draftAll : value === "all"}
                  onClick={() => (multiple ? selectAllDraft() : handleSingleSelect("all"))}
                  icon={<Layers className="h-4 w-4" />}
                />
              )}

              {filteredItems.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const reason = multiple
                    ? groupDisableReason(item, draftIds, items)
                    : undefined;
                  return (
                    <EvaluationCard
                      key={item.id}
                      label={item.label}
                      badges={item.badges ?? (item.badge ? [item.badge] : [])}
                      subtitle={item.subtitle}
                      isSelected={multiple ? draftIds.includes(item.id) : value === item.id}
                      onClick={() =>
                        multiple ? toggleDraft(item.id) : handleSingleSelect(item.id)
                      }
                      disabled={Boolean(reason)}
                      disabledReason={reason}
                      icon={<FileText className="h-4 w-4" />}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-background px-6 py-3">
          <span className="mr-auto text-sm text-muted-foreground">{footerSummary}</span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {multiple && (
            <Button size="sm" onClick={confirmMultiple}>
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
