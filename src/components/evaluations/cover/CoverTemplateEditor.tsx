import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  Upload,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CoverCanvas } from "@/components/evaluations/cover/CoverCanvas";
import { CoverTemplatesApi, coverTemplatesApiError } from "@/services/evaluation/coverTemplatesApi";
import {
  COVER_ALLOWED_FONTS,
  COVER_GROUP_LABELS,
  COVER_MAX_FONT_SIZE_PT,
  COVER_MIN_FONT_SIZE_PT,
  type CoverCatalogField,
  type CoverField,
  type CoverFieldAlign,
  type CoverFieldOverflow,
  type CoverFieldValign,
  type CoverTemplate,
} from "@/types/cover-template";

const DEFAULT_FIELD: Omit<CoverField, "id" | "key"> = {
  page: 1,
  x_norm: 0.12,
  y_norm_from_top: 0.12,
  w_norm: 0.5,
  h_norm: 0.035,
  font_name: "Helvetica",
  font_size_pt: 12,
  align: "left",
  valign: "middle",
  color: "#1a1a1a",
  uppercase: false,
  overflow: "ellipsis",
};

function statusLabel(status: CoverTemplate["status"]) {
  if (status === "active") return "Ativa";
  if (status === "inactive") return "Inativa";
  return "Rascunho";
}

function fieldIdFromKey(key: string, existing: CoverField[]) {
  const base = key.replace(/\./g, "_");
  if (!existing.some((field) => field.id === base)) return base;
  let i = 2;
  while (existing.some((field) => field.id === `${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function serializeFields(fields: CoverField[]) {
  return JSON.stringify(
    fields.map((field) => ({
      id: field.id,
      key: field.key,
      page: 1,
      x_norm: Number(field.x_norm.toFixed(6)),
      y_norm_from_top: Number(field.y_norm_from_top.toFixed(6)),
      w_norm: Number(field.w_norm.toFixed(6)),
      h_norm: Number(field.h_norm.toFixed(6)),
      font_name: field.font_name,
      font_size_pt: field.font_size_pt,
      align: field.align,
      valign: field.valign,
      color: field.color,
      uppercase: field.uppercase,
      max_chars: field.max_chars ?? null,
      overflow: field.overflow,
    }))
  );
}

interface CoverTemplateEditorProps {
  testId: string;
  evaluationTitle?: string;
  onBack: () => void;
}

export function CoverTemplateEditor({ testId, evaluationTitle, onBack }: CoverTemplateEditorProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
  const [template, setTemplate] = useState<CoverTemplate | null>(null);
  const [catalogFields, setCatalogFields] = useState<CoverCatalogField[]>([]);
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<CoverField[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isDirty = useMemo(() => {
    if (!template) return false;
    return (
      templateName.trim() !== (template.name || "").trim() ||
      serializeFields(fields) !== savedSnapshot
    );
  }, [fields, savedSnapshot, template, templateName]);

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, CoverCatalogField[]>();
    for (const item of catalogFields) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, [catalogFields]);

  const usedKeys = useMemo(() => new Set(fields.map((field) => field.key)), [fields]);

  const applyTemplate = useCallback((next: CoverTemplate) => {
    const nextFields = Array.isArray(next.fields?.fields) ? next.fields.fields : [];
    setTemplate(next);
    setTemplateName(next.name || "");
    setFields(nextFields);
    setSavedSnapshot(serializeFields(nextFields));
    setSelectedId(null);
  }, []);

  const loadBackground = useCallback(async (current: CoverTemplate) => {
    let objectUrl: string | null = null;
    try {
      if (current.source_kind === "jpeg" || current.source_kind === "png") {
        const original = await CoverTemplatesApi.getOriginalBlob(testId, current.id);
        objectUrl = URL.createObjectURL(original.blob);
      } else {
        const png = await CoverTemplatesApi.preview(testId, current.id, {
          sample: true,
          format: "png",
          fields: { fields: [] },
        });
        objectUrl = URL.createObjectURL(png);
      }
    } catch {
      try {
        const original = await CoverTemplatesApi.getOriginalBlob(testId, current.id);
        if (original.mimeType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(original.blob);
        }
      } catch {
        objectUrl = null;
      }
    }
    setBackgroundUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
  }, [testId]);

  useEffect(() => {
    return () => {
      if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    };
  }, [backgroundUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const [list, catalog] = await Promise.all([
          CoverTemplatesApi.list(testId),
          CoverTemplatesApi.getFieldCatalog(testId),
        ]);
        if (cancelled) return;
        setCatalogFields(catalog.fields ?? []);
        setSampleValues(catalog.sample_values ?? {});
        setTemplates(list);
        const preferred =
          list.find((item) => item.status === "active") ??
          list.find((item) => item.status === "draft") ??
          list[0] ??
          null;
        if (preferred) {
          applyTemplate(preferred);
          await loadBackground(preferred);
        }
      } catch (error) {
        toast({
          title: "Não foi possível abrir o editor de capa",
          description: await coverTemplatesApiError(error, "Tente novamente em instantes."),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applyTemplate, loadBackground, testId, toast]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const created = await CoverTemplatesApi.upload(testId, file, templateName || file.name);
      setTemplates((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      applyTemplate(created);
      await loadBackground(created);
      toast({
        title: "Capa enviada",
        description: "Posicione os campos sobre a página A4 e salve quando estiver pronto.",
      });
    } catch (error) {
      toast({
        title: "Falha no envio da capa",
        description: await coverTemplatesApiError(
          error,
          "Envie um PDF, JPG ou PNG em A4 retrato, com uma página."
        ),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addField = (key: string, xNorm?: number, yNorm?: number) => {
    const catalogItem = catalogFields.find((item) => item.key === key);
    if (!catalogItem) return;
    const existing = fields.find((field) => field.key === key);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    const id = fieldIdFromKey(key, fields);
    const next: CoverField = {
      ...DEFAULT_FIELD,
      id,
      key,
      x_norm: Math.min(xNorm ?? DEFAULT_FIELD.x_norm, 1 - DEFAULT_FIELD.w_norm),
      y_norm_from_top: Math.min(
        yNorm ?? DEFAULT_FIELD.y_norm_from_top + fields.length * 0.04,
        1 - DEFAULT_FIELD.h_norm
      ),
    };
    setFields((prev) => [...prev, next]);
    setSelectedId(id);
  };

  const updateField = useCallback((id: string, patch: Partial<CoverField>) => {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }, []);

  const removeSelected = () => {
    if (!selectedId) return;
    setFields((prev) => prev.filter((field) => field.id !== selectedId));
    setSelectedId(null);
  };

  const payloadFields = () =>
    fields.map((field) => ({
      id: field.id,
      key: field.key,
      page: 1 as const,
      x_norm: field.x_norm,
      y_norm_from_top: field.y_norm_from_top,
      w_norm: field.w_norm,
      h_norm: field.h_norm,
      font_name: field.font_name,
      font_size_pt: field.font_size_pt,
      align: field.align,
      valign: field.valign,
      color: field.color,
      uppercase: field.uppercase,
      max_chars: field.max_chars ?? null,
      overflow: field.overflow,
    }));

  const handleSave = async (options?: { silent?: boolean }): Promise<CoverTemplate | null> => {
    if (!template) return null;
    setIsSaving(true);
    try {
      const updated = await CoverTemplatesApi.update(testId, template.id, {
        name: templateName.trim() || template.name,
        fields: { fields: payloadFields() },
      });
      applyTemplate(updated);
      setTemplates((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (!options?.silent) {
        toast({ title: "Capa salva", description: "As posições dos campos foram gravadas." });
      }
      return updated;
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: await coverTemplatesApiError(error, "Confira os campos e tente de novo."),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!template) return;
    setIsActivating(true);
    try {
      const current = isDirty ? await handleSave({ silent: true }) : template;
      if (!current) return;
      const activated = await CoverTemplatesApi.activate(testId, current.id);
      applyTemplate(activated);
      setTemplates((prev) =>
        prev.map((item) =>
          item.id === activated.id
            ? activated
            : item.status === "active"
              ? { ...item, status: "inactive" }
              : item
        )
      );
      toast({
        title: "Capa ativada",
        description: "Esta capa será usada na geração da prova física.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível ativar a capa",
        description: await coverTemplatesApiError(error, "Salve os campos e tente novamente."),
        variant: "destructive",
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handlePreview = async () => {
    if (!template) return;
    setIsPreviewing(true);
    try {
      const blob = await CoverTemplatesApi.preview(testId, template.id, {
        sample: true,
        format: "png",
        fields: { fields: payloadFields() },
      });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setShowPreview(true);
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      toast({
        title: "Preview indisponível",
        description: await coverTemplatesApiError(
          error,
          status === 503
            ? "O servidor não conseguiu gerar o PNG. As posições no canvas continuam válidas."
            : "Não foi possível gerar o preview."
        ),
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    setIsDeleting(true);
    try {
      await CoverTemplatesApi.delete(testId, template.id);
      const remaining = templates.filter((item) => item.id !== template.id);
      setTemplates(remaining);
      const next = remaining[0] ?? null;
      if (next) {
        applyTemplate(next);
        await loadBackground(next);
      } else {
        setTemplate(null);
        setFields([]);
        setTemplateName("");
        setSavedSnapshot("");
        setBackgroundUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }
      setDeleteOpen(false);
      toast({ title: "Capa excluída" });
    } catch (error) {
      toast({
        title: "Não foi possível excluir",
        description: await coverTemplatesApiError(error, "Tente novamente."),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectTemplate = async (id: string) => {
    if (id === template?.id) return;
    if (isDirty) {
      const ok = window.confirm("Há alterações não salvas. Trocar de capa descarta essas alterações. Continuar?");
      if (!ok) return;
    }
    const next = templates.find((item) => item.id === id);
    if (!next) return;
    applyTemplate(next);
    await loadBackground(next);
  };

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando editor de capa…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-xl font-bold md:text-2xl">Capa da prova</h1>
          <p className="text-sm text-muted-foreground">
            {evaluationTitle
              ? `Defina a capa da avaliação “${evaluationTitle}” depois que ela já foi criada.`
              : "Envie um PDF ou imagem A4 retrato e posicione os campos variáveis."}
          </p>
        </div>
        {template && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={isPreviewing}>
              {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={isSaving || !isDirty}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleActivate()}
              disabled={isActivating || template.status === "active"}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isActivating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {template.status === "active" ? "Capa ativa" : "Ativar capa"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label htmlFor="cover-name">Nome da capa</Label>
          <Input
            id="cover-name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Ex.: Capa SAEB 2026"
          />
        </div>
        {templates.length > 1 && template && (
          <div className="w-full max-w-xs space-y-1">
            <Label>Template</Label>
            <Select value={template.id} onValueChange={(value) => void handleSelectTemplate(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({statusLabel(item.status)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {template ? "Enviar outra capa" : "Enviar capa"}
        </Button>
        {template && (
          <Button variant="outline" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </Button>
        )}
        {template && (
          <Badge variant={template.status === "active" ? "default" : "secondary"}>
            {statusLabel(template.status)}
          </Badge>
        )}
      </div>

      {!template ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex min-h-[420px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-6 text-center hover:bg-muted/50"
        >
          <ImagePlus className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Envie a capa da prova</p>
            <p className="text-sm text-muted-foreground">
              PDF, JPG ou PNG em A4 retrato (210×297 mm), uma página, sem rotação. A imagem não é esticada.
            </p>
          </div>
        </button>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <CoverCanvas
            fields={fields}
            selectedId={selectedId}
            pageWidthPt={template.page_width_pt}
            pageHeightPt={template.page_height_pt}
            backgroundUrl={backgroundUrl}
            catalogFields={catalogFields}
            sampleValues={sampleValues}
            onSelect={setSelectedId}
            onChangeField={updateField}
            onDropCatalogKey={(key, x, y) => addField(key, x, y)}
          />

          <div className="space-y-4">
            <div className="rounded-lg border">
              <div className="border-b px-3 py-2 text-sm font-medium">Campos</div>
              <ScrollArea className="h-[280px]">
                <div className="space-y-3 p-3">
                  {groupedCatalog.map(([group, items]) => (
                    <div key={group} className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {COVER_GROUP_LABELS[group] || group}
                      </p>
                      {items.map((item) => {
                        const used = usedKeys.has(item.key);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            draggable={!used}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("application/x-cover-field-key", item.key);
                              event.dataTransfer.setData("text/plain", item.key);
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => addField(item.key)}
                            className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                            disabled={used}
                          >
                            <span>{item.label}</span>
                            {used && <span className="text-xs text-muted-foreground">no canvas</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Propriedades</p>
              {!selectedField ? (
                <p className="text-sm text-muted-foreground">
                  Clique em um campo no canvas ou arraste um item da lista.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{selectedField.key}</p>
                  <div className="space-y-1">
                    <Label>Fonte</Label>
                    <Select
                      value={selectedField.font_name}
                      onValueChange={(value) => updateField(selectedField.id, { font_name: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COVER_ALLOWED_FONTS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tamanho ({selectedField.font_size_pt} pt)</Label>
                    <Slider
                      min={COVER_MIN_FONT_SIZE_PT}
                      max={COVER_MAX_FONT_SIZE_PT}
                      step={1}
                      value={[selectedField.font_size_pt]}
                      onValueChange={([value]) => updateField(selectedField.id, { font_size_pt: value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Alinhamento</Label>
                      <Select
                        value={selectedField.align}
                        onValueChange={(value) =>
                          updateField(selectedField.id, { align: value as CoverFieldAlign })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Esquerda</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="right">Direita</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Vertical</Label>
                      <Select
                        value={selectedField.valign}
                        onValueChange={(value) =>
                          updateField(selectedField.id, { valign: value as CoverFieldValign })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top">Topo</SelectItem>
                          <SelectItem value="middle">Meio</SelectItem>
                          <SelectItem value="bottom">Base</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Excedente</Label>
                    <Select
                      value={selectedField.overflow}
                      onValueChange={(value) =>
                        updateField(selectedField.id, { overflow: value as CoverFieldOverflow })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ellipsis">Reticências</SelectItem>
                        <SelectItem value="wrap">Quebrar linha</SelectItem>
                        <SelectItem value="clip">Cortar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-10 w-14 p-1"
                      value={selectedField.color || "#1a1a1a"}
                      onChange={(event) => updateField(selectedField.id, { color: event.target.value })}
                    />
                    <Input
                      value={selectedField.color || "#1a1a1a"}
                      onChange={(event) => updateField(selectedField.id, { color: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="cover-uppercase">Maiúsculas</Label>
                    <Switch
                      id="cover-uppercase"
                      checked={selectedField.uppercase}
                      onCheckedChange={(checked) => updateField(selectedField.id, { uppercase: checked })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cover-max-chars">Máximo de caracteres</Label>
                    <Input
                      id="cover-max-chars"
                      type="number"
                      min={1}
                      placeholder="Sem limite"
                      value={selectedField.max_chars ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        updateField(selectedField.id, {
                          max_chars: raw === "" ? null : Math.max(1, Number(raw) || 1),
                        });
                      }}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-red-600" onClick={removeSelected}>
                    Remover campo
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview da capa</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <img src={previewUrl} alt="Preview da capa" className="mx-auto max-h-[75vh] w-auto rounded border" />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta capa?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo e os campos posicionados serão removidos. Se ela estiver ativa, a prova volta a usar a capa Afirme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
