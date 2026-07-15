import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { resizeImageToDataUrl, TARGET_SIZE_BY_ASPECT } from "@/utils/resizeImage";

interface InteractionImageUploadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  aspect?: "square" | "wide" | "auto";
  className?: string;
}

/**
 * Upload de imagem simples (base64 dataURL) para uso dentro do `interactionConfig`
 * de questões subjetivas. O backend salva `interactionConfig` como JSON livre sem
 * validar o schema interno, então embutir a imagem como dataURL evita depender de
 * um endpoint de upload dedicado — mesma abordagem do protótipo de referência.
 *
 * Todas as imagens enviadas para um mesmo `aspect` (ex.: as duas colunas de "Ligar
 * Colunas") são redimensionadas para as mesmas dimensões fixas antes de serem
 * salvas, para que fiquem sempre do mesmo tamanho independente do arquivo original.
 */
export function InteractionImageUpload({
  value,
  onChange,
  label = "Adicionar imagem",
  aspect = "auto",
  className,
}: InteractionImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      window.alert("Imagem muito grande (máx 4MB).");
      return;
    }

    const target = TARGET_SIZE_BY_ASPECT[aspect];
    if (!target) {
      const reader = new FileReader();
      reader.onload = () => onChange(String(reader.result));
      reader.readAsDataURL(file);
      return;
    }

    try {
      const dataUrl = await resizeImageToDataUrl(file, target.width, target.height, "contain");
      onChange(dataUrl);
    } catch (error) {
      console.error("Erro ao redimensionar imagem:", error);
      window.alert("Não foi possível processar essa imagem. Tente outro arquivo.");
    }
  }

  const box =
    aspect === "square"
      ? "aspect-square"
      : aspect === "wide"
        ? "aspect-[16/9]"
        : "min-h-[80px]";

  if (value) {
    return (
      <div className={`relative overflow-hidden rounded-lg border border-border bg-muted/40 ${box} ${className ?? ""}`}>
        <img src={value} alt="" className="h-full w-full object-contain" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
          aria-label="Remover imagem"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={`flex ${box} w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary ${className ?? ""}`}
    >
      <ImagePlus className="h-5 w-5" />
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </button>
  );
}

export default InteractionImageUpload;
