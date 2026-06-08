import { useEffect, useState } from "react";
import type { EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";
import {
  cityStateDisplay,
  etiquetasSerieTurmaLine,
  etiquetasTurnoLabel,
  TEXTO_ACIMA_ASSINATURA_MAX,
} from "@/utils/etiquetasDisplay";
import { getCityBranding, resolveBrandingUrls } from "@/services/cityBrandingApi";
import { loadBrandingImage } from "@/utils/brandingImageUtils";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import {
  EtiquetaRichTextPreview,
  EtiquetaUnderlinedLabel,
} from "@/components/documents/EtiquetaRichTextPreview";

type EtiquetaPreviewCanvasProps = {
  label: EtiquetaEditItem;
  context: EtiquetasDadosResponse;
  logoUrl: string | null;
  className?: string;
};

export function EtiquetaPreviewCanvas({ label, context, logoUrl, className = "" }: EtiquetaPreviewCanvasProps) {
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(logoUrl);

  useEffect(() => {
    setResolvedLogoUrl(logoUrl);
  }, [logoUrl]);

  useEffect(() => {
    if (logoUrl) return;

    let cancelled = false;
    const municipioId = context.municipio.id;

    async function loadLogo() {
      try {
        const assets = await loadCityBrandingPdfAssets(municipioId);
        if (assets.logo?.dataUrl && !cancelled) {
          setResolvedLogoUrl(assets.logo.dataUrl);
          return;
        }

        const branding = await getCityBranding(municipioId);
        const urls = resolveBrandingUrls(branding);
        const displayUrl = await loadBrandingImage(urls.logo_url, undefined, municipioId);
        if (!cancelled) {
          setResolvedLogoUrl(displayUrl ?? null);
        }
      } catch {
        if (!cancelled) setResolvedLogoUrl(null);
      }
    }

    void loadLogo();
    return () => {
      cancelled = true;
    };
  }, [context.municipio.id, logoUrl]);

  const freeFontSize = label.textoLivreTamanho || 16;
  const freeColor = label.exibirAssinatura ? "#000000" : label.textoLivreCor;

  return (
    <div
      className={`flex aspect-[93/65] w-full flex-col overflow-hidden border-2 border-black bg-white p-3 text-sm leading-snug text-black [color-scheme:light] ${className}`}
      style={{ backgroundColor: "#ffffff", color: "#000000" }}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-left text-base font-bold uppercase break-words text-black">
          {label.titulo || "Título da etiqueta"}
        </p>
        {resolvedLogoUrl ? (
          <img
            src={resolvedLogoUrl}
            alt="Logo do município"
            className="h-10 w-10 shrink-0 object-contain"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 animate-pulse border border-black/20 bg-white" aria-hidden />
        )}
      </div>

      <div className="mt-1 shrink-0 space-y-0.5 text-center text-black">
        <p className="text-xs font-bold uppercase break-words">{cityStateDisplay(context).toUpperCase()}</p>
        <p className="text-xs font-bold uppercase break-words">{context.contexto.escola}</p>
        <p className="text-[11px] uppercase break-words">
          <EtiquetaUnderlinedLabel
            label="Modalidade/Etapa: "
            value={context.contexto.nivel.toUpperCase()}
          />
        </p>
        <p className="text-[11px] uppercase break-words">
          <EtiquetaUnderlinedLabel
            label="Série/Turma: "
            value={etiquetasSerieTurmaLine(context).toUpperCase()}
          />
        </p>
        <p className="text-[11px] uppercase break-words">
          <EtiquetaUnderlinedLabel
            label="Turno: "
            value={etiquetasTurnoLabel(context).toUpperCase()}
          />
        </p>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-black pt-2">
        <div className="flex min-h-0 flex-1 items-center justify-center px-1">
          <EtiquetaRichTextPreview
            text={label.textoLivre}
            align={label.textoLivreAlinhamento}
            color={freeColor}
            fontSize={freeFontSize}
            className="w-full text-black"
          />
        </div>
      </div>

      {label.exibirAssinatura && label.textoAcimaAssinatura.trim() && (
        <p className="mt-1 shrink-0 text-center text-[11px] font-bold uppercase break-words text-black">
          {label.textoAcimaAssinatura.slice(0, TEXTO_ACIMA_ASSINATURA_MAX)}
        </p>
      )}

      {label.exibirAssinatura && (
        <div className="mt-1 shrink-0 space-y-1 border-t border-black pt-1 text-[10px] text-black">
          <p>
            <span>NOME DO APLICADOR:</span> {label.nomeAplicador || "________________________"}
          </p>
          <p>
            <span>CPF:</span> {label.cpfAplicador || "________________________"}
          </p>
        </div>
      )}
    </div>
  );
}
