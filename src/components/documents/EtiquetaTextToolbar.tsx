import { useRef } from "react";
import { Bold, Italic, Minus, Plus, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { wrapSelectionWithMarker } from "@/utils/richTextMarkers";
import { EtiquetaAlignToolbar } from "@/components/documents/EtiquetaAlignToolbar";
import type { EtiquetaTextoLivreAlinhamento } from "@/types/etiquetas";

export const ETIQUETA_TEXTO_TAMANHO_MIN = 8;
export const ETIQUETA_TEXTO_TAMANHO_MAX = 20;

type EtiquetaTextToolbarProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  align: EtiquetaTextoLivreAlinhamento;
  onAlignChange: (value: EtiquetaTextoLivreAlinhamento) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  placeholder?: string;
};

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(ETIQUETA_TEXTO_TAMANHO_MAX, Math.max(ETIQUETA_TEXTO_TAMANHO_MIN, Math.round(value)));
}

export function EtiquetaTextToolbar({
  id,
  value,
  onChange,
  align,
  onAlignChange,
  fontSize,
  onFontSizeChange,
  placeholder,
}: EtiquetaTextToolbarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentSize = clampFontSize(fontSize);

  const applyMarker = (marker: "**" | "*" | "__") => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = wrapSelectionWithMarker(value, start, end, marker);
    onChange(result.next);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Negrito"
          aria-label="Negrito"
          onClick={() => applyMarker("**")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Itálico"
          aria-label="Itálico"
          onClick={() => applyMarker("*")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Sublinhado"
          aria-label="Sublinhado"
          onClick={() => applyMarker("__")}
        >
          <Underline className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <div className="flex items-center gap-0.5" title="Tamanho do texto">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 px-0"
            aria-label="Diminuir tamanho"
            disabled={currentSize <= ETIQUETA_TEXTO_TAMANHO_MIN}
            onClick={() => onFontSizeChange(clampFontSize(currentSize - 1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            id={`${id}-font-size`}
            type="number"
            min={ETIQUETA_TEXTO_TAMANHO_MIN}
            max={ETIQUETA_TEXTO_TAMANHO_MAX}
            step={1}
            value={currentSize}
            aria-label="Tamanho do texto em pontos"
            className="h-8 w-14 border-0 bg-transparent px-1 text-center shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(next)) return;
              onFontSizeChange(clampFontSize(next));
            }}
          />
          <span className="pr-1 text-xs text-muted-foreground">pt</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 px-0"
            aria-label="Aumentar tamanho"
            disabled={currentSize >= ETIQUETA_TEXTO_TAMANHO_MAX}
            onClick={() => onFontSizeChange(clampFontSize(currentSize + 1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="min-h-[72px] resize-y text-sm"
      />

      <EtiquetaAlignToolbar id={`${id}-align`} value={align} onChange={onAlignChange} />

      <p className="text-xs text-muted-foreground">
        Use a barra para negrito, itálico, sublinhado e tamanho (8–20 pt). Marcadores: **negrito**, *itálico*,
        __sublinhado__.
      </p>
    </div>
  );
}
