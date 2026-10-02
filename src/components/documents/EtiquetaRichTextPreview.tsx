import { parseRichMarkers } from "@/utils/richTextMarkers";
import type { EtiquetaTextoLivreAlinhamento } from "@/types/etiquetas";

type EtiquetaRichTextPreviewProps = {
  text: string;
  align?: EtiquetaTextoLivreAlinhamento;
  color?: string;
  fontSize?: number;
  className?: string;
};

const ALIGN_CLASS: Record<EtiquetaTextoLivreAlinhamento, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function EtiquetaRichTextPreview({
  text,
  align = "center",
  color = "#000000",
  fontSize = 10,
  className = "",
}: EtiquetaRichTextPreviewProps) {
  const segments = parseRichMarkers(text || "Texto livre da etiqueta");

  return (
    <p
      className={`whitespace-pre-wrap break-words leading-snug ${ALIGN_CLASS[align]} ${className}`}
      style={{ color, fontSize: `${Math.max(9, fontSize * 0.95)}px` }}
    >
      {segments.map((segment, index) => (
        <span
          key={`${index}-${segment.text}`}
          style={{
            fontWeight: segment.bold ? 700 : undefined,
            fontStyle: segment.italic ? "italic" : undefined,
            textDecoration: segment.underline ? "underline" : undefined,
          }}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}

type UnderlinedLabelProps = {
  label: string;
  value: string;
};

export function EtiquetaUnderlinedLabel({ label, value }: UnderlinedLabelProps) {
  return (
    <span>
      <span className="underline">{label}</span>
      {value}
    </span>
  );
}
