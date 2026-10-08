import { useEffect, useState } from "react";
import type { EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";
import {
  cityStateDisplay,
  etiquetasSerieTurmaTurnoLine,
  TEXTO_ACIMA_ASSINATURA_MAX,
  TEXTO_LIVRE_TAMANHO_PADRAO,
} from "@/utils/etiquetasDisplay";
import { getCityBranding, resolveBrandingUrls } from "@/services/cityBrandingApi";
import { loadBrandingImage } from "@/utils/brandingImageUtils";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import { EtiquetaRichTextPreview } from "@/components/documents/EtiquetaRichTextPreview";

type EtiquetaPreviewCanvasProps = {
  label: EtiquetaEditItem;
  context: EtiquetasDadosResponse;
  logoUrl: string | null;
  className?: string;
};

function AplicadorCampo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="flex items-end gap-1">
      <span className="shrink-0">{rotulo}</span>
      <span className="min-h-[1.2em] min-w-0 flex-1 truncate border-b border-black">{valor}</span>
    </p>
  );
}

function AplicadorBloco({
  textoAcima,
  nome,
  cpf,
  compacto,
}: {
  textoAcima: string;
  nome: string;
  cpf: string;
  compacto: boolean;
}) {
  return (
    <div className="mt-1 shrink-0 border border-black px-1.5 pb-1 pt-0.5 text-black">
      {textoAcima.trim() && (
        <p className="text-center text-[11px] font-bold uppercase break-words">
          {textoAcima.slice(0, TEXTO_ACIMA_ASSINATURA_MAX)}
        </p>
      )}
      <div
        className={`mt-0.5 ${compacto ? "space-y-0.5 text-[6.5px]" : "space-y-1 text-[7px]"}`}
      >
        <AplicadorCampo rotulo="NOME DO APLICADOR:" valor={nome} />
        <AplicadorCampo rotulo="CPF:" valor={cpf} />
      </div>
    </div>
  );
}

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

  const freeFontSize = label.textoLivreTamanho || TEXTO_LIVRE_TAMANHO_PADRAO;
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
        <p className="text-[10px] font-bold uppercase break-words">
          {cityStateDisplay(context).toUpperCase()}
        </p>
        <p className="text-[10px] font-bold uppercase break-words">{context.contexto.escola}</p>
        <p className="text-[9px] uppercase break-words">
          Modalidade/Etapa: {context.contexto.nivel.toUpperCase()}
        </p>
        <p className="text-[9px] uppercase break-words">
          Série | Turma | Turno: {etiquetasSerieTurmaTurnoLine(context).toUpperCase()}
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

      {label.exibirAssinatura && (
        <AplicadorBloco
          textoAcima={label.textoAcimaAssinatura}
          nome={label.nomeAplicador}
          cpf={label.cpfAplicador}
          compacto={label.exibirSegundoAplicador}
        />
      )}
      {label.exibirAssinatura && label.exibirSegundoAplicador ? (
        <AplicadorBloco
          textoAcima={label.textoAcimaAssinatura2 ?? ""}
          nome={label.nomeAplicador2}
          cpf={label.cpfAplicador2}
          compacto
        />
      ) : null}
    </div>
  );
}
