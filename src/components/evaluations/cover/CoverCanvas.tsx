import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { CoverCatalogField, CoverField } from "@/types/cover-template";

const MIN_W = 0.04;
const MIN_H = 0.018;

type ResizeHandle = "se" | "e" | "s";

type DragState =
  | {
      mode: "move";
      fieldId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      mode: "resize";
      handle: ResizeHandle;
      fieldId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fontCss(field: CoverField): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const name = field.font_name || "Helvetica";
  if (name.startsWith("Times")) {
    return {
      fontFamily: '"Times New Roman", Times, serif',
      fontWeight: name.includes("Bold") ? 700 : 400,
      fontStyle: name.includes("Italic") ? "italic" : "normal",
    };
  }
  if (name.startsWith("Courier")) {
    return {
      fontFamily: '"Courier New", Courier, monospace',
      fontWeight: name.includes("Bold") ? 700 : 400,
      fontStyle: name.includes("Oblique") ? "italic" : "normal",
    };
  }
  return {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: name.includes("Bold") ? 700 : 400,
    fontStyle: name.includes("Oblique") ? "italic" : "normal",
  };
}

function sampleText(field: CoverField, catalogFields: CoverCatalogField[], samples: Record<string, string>) {
  const raw = samples[field.key] || catalogFields.find((item) => item.key === field.key)?.label || field.key;
  const text = field.uppercase ? raw.toUpperCase() : raw;
  if (field.max_chars && text.length > field.max_chars) {
    return text.slice(0, Math.max(1, field.max_chars - 1)) + "…";
  }
  return text;
}

interface CoverCanvasProps {
  fields: CoverField[];
  selectedId: string | null;
  pageWidthPt: number;
  pageHeightPt: number;
  backgroundUrl: string | null;
  catalogFields: CoverCatalogField[];
  sampleValues: Record<string, string>;
  onSelect: (id: string | null) => void;
  onChangeField: (id: string, patch: Partial<CoverField>) => void;
  onDropCatalogKey: (key: string, xNorm: number, yNorm: number) => void;
}

export function CoverCanvas({
  fields,
  selectedId,
  pageWidthPt,
  pageHeightPt,
  backgroundUrl,
  catalogFields,
  sampleValues,
  onSelect,
  onChangeField,
  onDropCatalogKey,
}: CoverCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const aspect = pageWidthPt > 0 && pageHeightPt > 0 ? pageWidthPt / pageHeightPt : 210 / 297;

  const clientToNorm = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!drag || !rect || rect.width === 0 || rect.height === 0) return;

      const dx = (clientX - drag.startX) / rect.width;
      const dy = (clientY - drag.startY) / rect.height;

      if (drag.mode === "move") {
        const current = fieldsRef.current.find((item) => item.id === drag.fieldId);
        const w = current?.w_norm ?? MIN_W;
        const h = current?.h_norm ?? MIN_H;
        onChangeField(drag.fieldId, {
          x_norm: clamp(drag.origX + dx, 0, 1 - w),
          y_norm_from_top: clamp(drag.origY + dy, 0, 1 - h),
        });
        return;
      }

      let nextW = drag.origW;
      let nextH = drag.origH;
      if (drag.handle === "e" || drag.handle === "se") {
        nextW = clamp(drag.origW + dx, MIN_W, 1 - drag.origX);
      }
      if (drag.handle === "s" || drag.handle === "se") {
        nextH = clamp(drag.origH + dy, MIN_H, 1 - drag.origY);
      }
      onChangeField(drag.fieldId, { w_norm: nextW, h_norm: nextH });
    },
    [onChangeField]
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const startMove = (event: ReactPointerEvent, field: CoverField) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onSelect(field.id);
    dragRef.current = {
      mode: "move",
      fieldId: field.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: field.x_norm,
      origY: field.y_norm_from_top,
    };
  };

  const startResize = (event: ReactPointerEvent, field: CoverField, handle: ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onSelect(field.id);
    dragRef.current = {
      mode: "resize",
      handle,
      fieldId: field.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: field.x_norm,
      origY: field.y_norm_from_top,
      origW: field.w_norm,
      origH: field.h_norm,
    };
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      applyDrag(event.clientX, event.clientY);
    };
    const onUp = () => stopDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyDrag, stopDrag]);

  return (
    <div
      className="relative mx-auto w-full max-w-[min(100%,560px)] overflow-hidden rounded-md border bg-white shadow-sm [container-type:size]"
      style={{ aspectRatio: `${aspect}` }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const key = event.dataTransfer.getData("application/x-cover-field-key") || event.dataTransfer.getData("text/plain");
        if (!key) return;
        const pos = clientToNorm(event.clientX, event.clientY);
        onDropCatalogKey(key, pos.x, pos.y);
      }}
    >
      <div
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={() => onSelect(null)}
      >
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt="Fundo da capa"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-100" />
        )}

        {fields.map((field) => {
          const selected = field.id === selectedId;
          const css = fontCss(field);
          return (
            <div
              key={field.id}
              className={cn(
                "absolute box-border cursor-move overflow-hidden border border-dashed",
                selected
                  ? "z-10 border-primary bg-primary/10"
                  : "border-sky-500/80 bg-sky-500/5 hover:border-sky-600"
              )}
              style={{
                left: `${field.x_norm * 100}%`,
                top: `${field.y_norm_from_top * 100}%`,
                width: `${field.w_norm * 100}%`,
                height: `${field.h_norm * 100}%`,
                color: field.color || "#1a1a1a",
                fontFamily: css.fontFamily,
                fontWeight: css.fontWeight,
                fontStyle: css.fontStyle,
                fontSize: `${((field.font_size_pt || 12) / pageHeightPt) * 100}cqh`,
                textAlign: field.align,
                textTransform: field.uppercase ? "uppercase" : "none",
                display: "flex",
                alignItems:
                  field.valign === "top" ? "flex-start" : field.valign === "bottom" ? "flex-end" : "center",
                justifyContent:
                  field.align === "center" ? "center" : field.align === "right" ? "flex-end" : "flex-start",
                whiteSpace: field.overflow === "wrap" ? "normal" : "nowrap",
                lineHeight: 1.15,
                padding: "0 2px",
              }}
              onPointerDown={(event) => startMove(event, field)}
            >
              <span
                className={cn(
                  "block w-full leading-tight",
                  field.overflow === "ellipsis" && "truncate",
                  field.overflow === "clip" && "overflow-hidden"
                )}
              >
                {sampleText(field, catalogFields, sampleValues)}
              </span>
              {selected && (
                <>
                  <button
                    type="button"
                    aria-label="Redimensionar largura"
                    className="absolute right-0 top-1/2 z-20 h-4 w-2 -translate-y-1/2 cursor-e-resize rounded-sm bg-primary"
                    onPointerDown={(event) => startResize(event, field, "e")}
                  />
                  <button
                    type="button"
                    aria-label="Redimensionar altura"
                    className="absolute bottom-0 left-1/2 z-20 h-2 w-4 -translate-x-1/2 cursor-s-resize rounded-sm bg-primary"
                    onPointerDown={(event) => startResize(event, field, "s")}
                  />
                  <button
                    type="button"
                    aria-label="Redimensionar"
                    className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-se-resize rounded-sm bg-primary"
                    onPointerDown={(event) => startResize(event, field, "se")}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
