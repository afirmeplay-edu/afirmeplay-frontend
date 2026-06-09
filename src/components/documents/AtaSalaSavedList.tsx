import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { deleteSavedAta, getAtaSalaApiError, getSavedAta, listSavedAtas } from "@/services/documents/ataSalaApi";
import { downloadAtaSalaPdf } from "@/services/reports/ataSalaPdf";
import type { AtaModoLista, AtaOptions, AtaSalaPdfData, SavedAtaSummary } from "@/types/ata-sala";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DEFAULT_ATA_OPTIONS: AtaOptions = {
  applicationDayLabel: "1º dia de aplicação",
  dateDay: "",
  dateMonth: "",
  dateYear: "",
  startHour: "",
  startMinute: "",
  endHour: "",
  endMinute: "",
  didNotOccurReason: "",
  occurrenceA: false,
  occurrenceB: false,
  occurrenceC: false,
  occurrenceD: false,
  occurrenceE: false,
  occurrenceDetail5: "",
  noOccurrences: false,
  occurrenceDetail6: "",
  q7Responded: "",
  q8NotResponded: "",
  q9Tablets: "",
  q10SpecialStayed: "",
  q11SpecialRegularRoom: "",
  q12SpecialSupportRoom: "",
  assinaturaAplicador: "",
  cpfAplicador: "",
  assinaturaApoioRegular: "",
  cpfApoioRegular: "",
  assinaturaApoioSuporte: "",
  cpfApoioSuporte: "",
};

function buildPdfFileName(title: string): string {
  const slug =
    title
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "ata-de-sala";
  return `${slug}.pdf`;
}

function normalizePdfData(content: AtaSalaPdfData): AtaSalaPdfData {
  return {
    ...content,
    options: { ...DEFAULT_ATA_OPTIONS, ...(content.options || {}) },
  };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

/** Evita exibir nomes de escola totalmente em caixa alta vindos da API. */
function formatSchoolDisplay(name: string): string {
  const t = name.trim();
  if (!t) return "—";
  if (t.length > 4 && t === t.toUpperCase()) {
    return t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return t;
}

const MODO_CONFIG: Record<
  AtaModoLista,
  { label: string; accent: string; badge: string; iconBg: string }
> = {
  turma: {
    label: "Personalizável",
    accent: "bg-violet-500",
    badge:
      "border-violet-200/70 bg-violet-500/10 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300",
    iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  avaliacao: {
    label: "Avaliação",
    accent: "bg-blue-500",
    badge:
      "border-blue-200/70 bg-blue-500/10 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  cartao_resposta: {
    label: "Cartão resposta",
    accent: "bg-emerald-500",
    badge:
      "border-emerald-200/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

function getModoConfig(modo: string) {
  return MODO_CONFIG[modo as AtaModoLista] ?? {
    label: modo,
    accent: "bg-primary",
    badge: "border-border bg-muted text-muted-foreground",
    iconBg: "bg-primary/10 text-primary",
  };
}

type MetaRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function MetaRow({ icon, label, value }: MetaRowProps) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground line-clamp-2 leading-snug">{value}</p>
      </div>
    </div>
  );
}

type AtaSalaSavedListProps = {
  refreshToken?: number;
  defaultCityId?: string;
};

export function AtaSalaSavedList({ refreshToken = 0, defaultCityId }: AtaSalaSavedListProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<SavedAtaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedAtaSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSavedAtas({
        page: 1,
        per_page: 50,
        search: debouncedSearch || undefined,
        cityId: defaultCityId,
      });
      setItems(data.items ?? []);
    } catch (err: unknown) {
      toast({
        title: "Erro ao carregar atas",
        description: getAtaSalaApiError(err),
        variant: "destructive",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [defaultCityId, debouncedSearch, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshToken]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSavedAta(deleteTarget.id, deleteTarget.city_id || defaultCityId);
      toast({ title: "Ata excluída", description: "A ata foi removida com sucesso." });
      setDeleteTarget(null);
      fetchList();
    } catch (err: unknown) {
      toast({
        title: "Erro ao excluir",
        description: getAtaSalaApiError(err),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const openAta = (item: SavedAtaSummary) => {
    navigate(`/app/documentos/ata-sala/${item.id}`, { state: { cityId: item.city_id } });
  };

  const handleGeneratePdf = async (item: SavedAtaSummary) => {
    setPdfLoadingId(item.id);
    try {
      const detail = await getSavedAta(item.id, item.city_id || defaultCityId);
      const pdfData = normalizePdfData(detail.content);
      await downloadAtaSalaPdf(
        pdfData,
        buildPdfFileName(detail.title || item.title),
        item.city_id || defaultCityId
      );
      toast({
        title: "PDF gerado",
        description: "O download da ata foi iniciado.",
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao gerar PDF",
        description: getAtaSalaApiError(err),
        variant: "destructive",
      });
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 max-w-lg space-y-1.5">
          <Label htmlFor="ata-saved-search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="ata-saved-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Título ou nome do autor"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:pb-0.5">
          {!loading && items.length > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {items.length} {items.length === 1 ? "ata" : "atas"}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="font-medium text-foreground">Nenhuma ata salva</p>
              <p className="text-sm text-muted-foreground">
                {debouncedSearch
                  ? "Nenhum resultado para a busca. Tente outro termo."
                  : "Salve uma ata na aba Nova ata para vê-la listada aqui."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const modo = getModoConfig(item.modo_lista);
            const turmaDisciplina = [item.serie_turma, item.disciplina].filter(Boolean).join(" · ");

            return (
              <Card
                key={item.id}
                className={cn(
                  "group relative overflow-hidden border-border/80 transition-all duration-200",
                  "hover:border-primary/25 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                )}
              >
                <span
                  className={cn("absolute left-0 top-0 bottom-0 w-1", modo.accent)}
                  aria-hidden
                />

                <CardHeader className="pb-3 pl-5">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        modo.iconBg
                      )}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold leading-snug line-clamp-2 pr-1">
                          {item.title}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wide", modo.badge)}
                        >
                          {modo.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            <span className="text-foreground/80 font-medium">{item.created_by_name}</span>
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {formatUpdatedAt(item.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pb-3 pl-5 text-sm">
                  <MetaRow
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label="Escola"
                    value={formatSchoolDisplay(item.escola)}
                  />
                  <MetaRow
                    icon={<GraduationCap className="h-3.5 w-3.5" />}
                    label="Turma / série"
                    value={item.serie_turma?.trim() || ""}
                  />
                  {item.disciplina?.trim() ? (
                    <MetaRow
                      icon={<BookOpen className="h-3.5 w-3.5" />}
                      label="Disciplina"
                      value={item.disciplina.trim()}
                    />
                  ) : turmaDisciplina && !item.serie_turma ? (
                    <MetaRow
                      icon={<BookOpen className="h-3.5 w-3.5" />}
                      label="Detalhes"
                      value={turmaDisciplina}
                    />
                  ) : null}
                </CardContent>

                <CardFooter className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-3 pl-5">
                  <Button
                    size="sm"
                    className="flex-1 min-w-[7rem] sm:flex-none"
                    onClick={() => openAta(item)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {item.is_owner ? "Editar" : "Abrir"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 min-w-[7rem] sm:flex-none"
                    disabled={pdfLoadingId === item.id}
                    onClick={() => handleGeneratePdf(item)}
                  >
                    {pdfLoadingId === item.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Gerar PDF
                  </Button>
                  {item.is_owner ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      aria-label={`Excluir ata ${item.title}`}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir ata</DialogTitle>
            <DialogDescription>
              Confirma a exclusão de &quot;{deleteTarget?.title}&quot;? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
