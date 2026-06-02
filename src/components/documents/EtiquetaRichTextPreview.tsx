import { parseBoldMarkers } from "@/utils/richTextMarkers";
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
  fontSize = 16,
  className = "",
}: EtiquetaRichTextPreviewProps) {
  const segments = parseBoldMarkers(text || "Texto livre da etiqueta");

  return (
    <p
      className={`whitespace-pre-wrap break-words ${ALIGN_CLASS[align]} ${className}`}
      style={{ color, fontSize: `${fontSize}px` }}
    >
      {segments.map((segment, index) =>
        segment.bold ? (
          <strong key={`${index}-${segment.text}`}>{segment.text}</strong>
        ) : (
          <span key={`${index}-${segment.text}`}>{segment.text}</span>
        )
      )}
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
