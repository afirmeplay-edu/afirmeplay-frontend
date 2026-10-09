import { useEffect, useMemo, useState } from "react";
import type { EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";
import {
  cityStateDisplay,
  etiquetaAplicadores,
  etiquetasSerieTurmaTurnoLine,
  TEXTO_ACIMA_ASSINATURA_MAX,
} from "@/utils/etiquetasDisplay";
import { getCourseColor } from "@/utils/gradeToCourse";
import { getCityBranding, resolveBrandingUrls } from "@/services/cityBrandingApi";
import { loadBrandingImage } from "@/utils/brandingImageUtils";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import { logoHeightFor, planEtiqueta, type EtiquetaPlano, type LogoDims } from "@/services/reports/etiquetasPdf";
import { EtiquetaRichTextPreview } from "@/components/documents/EtiquetaRichTextPreview";

type EtiquetaPreviewCanvasProps = {
  label: EtiquetaEditItem;
  context: EtiquetasDadosResponse;
  logoUrl: string | null;
  className?: string;
};

const PT_TO_MM = 25.4 / 72;
const LOGO_WIDTH = 8;
const LOGO_GAP = 1.5;
const LOGO_DIMS_PADRAO: LogoDims = { iw: 1, ih: 1 };

type Escala = { mm: (value: number) => string; pt: (value: number) => string };

/** Medidas proporcionais à largura da etiqueta (container), para bater com o PDF. */
function escalaPara(larguraMm: number): Escala {
  const mm = (value: number) => `${((value * 100) / larguraMm).toFixed(3)}cqw`;
  return { mm, pt: (value: number) => mm(value * PT_TO_MM) };
}

function fonteStyle(escala: Escala, size: number) {
  return { fontSize: escala.pt(size), lineHeight: 1.18 };
}

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
  escala,
}: {
  textoAcima: string;
  nome: string;
  cpf: string;
  compacto: boolean;
  escala: Escala;
}) {
  return (
    <div
      className="min-w-0 border border-black text-black"
      style={{ padding: `${escala.mm(0.6)} ${escala.mm(1.5)}` }}
    >
      {textoAcima.trim() && (
        <p className="truncate text-center font-bold uppercase">
          {textoAcima.slice(0, TEXTO_ACIMA_ASSINATURA_MAX)}
        </p>
      )}
      <AplicadorCampo rotulo={compacto ? "NOME:" : "NOME DO APLICADOR:"} valor={nome} />
      <AplicadorCampo rotulo="CPF:" valor={cpf} />
    </div>
  );
}

function AplicadoresRodape({
  label,
  plano,
  escala,
}: {
  label: EtiquetaEditItem;
  plano: EtiquetaPlano;
  escala: Escala;
}) {
  const aplicadores = etiquetaAplicadores(label);
  if (!aplicadores.length) return null;
  return (
    <div
      className="grid shrink-0"
      style={{
        ...fonteStyle(escala, plano.fonteAplicadores),
        gridTemplateColumns: `repeat(${plano.colunasAplicadores}, minmax(0, 1fr))`,
        marginTop: escala.mm(1),
        columnGap: escala.mm(1.5),
        rowGap: escala.mm(1),
      }}
    >
      {aplicadores.map((aplicador, index) => (
        <AplicadorBloco key={index} {...aplicador} compacto={plano.aplicadoresCompactos} escala={escala} />
      ))}
    </div>
  );
}

export function EtiquetaPreviewCanvas({ label, context, logoUrl, className = "" }: EtiquetaPreviewCanvasProps) {
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(logoUrl);
  const [logoDims, setLogoDims] = useState<LogoDims>(LOGO_DIMS_PADRAO);

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

  const plano = useMemo(() => planEtiqueta(context, label, logoDims), [context, label, logoDims]);
  const escala = escalaPara(plano.larguraMm);
  const { mm } = escala;
  const fonte = fonteStyle(escala, plano.fonteFixa);
  const logoAltura = logoHeightFor(logoDims);
  const recuoLogo = mm(LOGO_WIDTH + LOGO_GAP);

  const freeColor = label.exibirAssinatura ? "#000000" : label.textoLivreCor;
  const nivel = context.contexto.nivel.trim().toUpperCase();

  return (
    <div className={`w-full ${className}`} style={{ containerType: "inline-size" }}>
      <div
        className="flex w-full flex-col overflow-hidden border-2 border-black bg-white text-black [color-scheme:light]"
        style={{
          backgroundColor: "#ffffff",
          color: "#000000",
          padding: mm(3),
          aspectRatio: `${plano.larguraMm} / ${plano.alturaMm}`,
        }}
      >
        <div className="relative shrink-0 text-black" style={{ minHeight: mm(logoAltura) }}>
          {resolvedLogoUrl ? (
            <img
              src={resolvedLogoUrl}
              alt="Logo do município"
              className="absolute right-0 top-0 object-contain"
              style={{ width: mm(LOGO_WIDTH), height: mm(logoAltura) }}
              onLoad={(event) => {
                const { naturalWidth: iw, naturalHeight: ih } = event.currentTarget;
                if (iw > 0 && ih > 0 && (iw !== logoDims.iw || ih !== logoDims.ih)) setLogoDims({ iw, ih });
              }}
            />
          ) : (
            <div
              className="absolute right-0 top-0 animate-pulse border border-black/20 bg-white"
              style={{ width: mm(LOGO_WIDTH), height: mm(LOGO_WIDTH) }}
              aria-hidden
            />
          )}
          <p
            className="line-clamp-2 text-left font-bold uppercase break-words"
            style={{ ...fonte, paddingRight: recuoLogo }}
          >
            {label.titulo || "Título da etiqueta"}
          </p>
          <div className="text-center" style={{ padding: `0 ${recuoLogo}` }}>
            <p className="truncate font-bold uppercase" style={fonte}>
              {cityStateDisplay(context).toUpperCase()}
            </p>
            <p className="line-clamp-2 font-bold uppercase break-words" style={fonte}>
              {context.contexto.escola}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-center text-black" style={{ marginTop: mm(0.4) }}>
          <p className="flex flex-wrap items-center justify-center" style={fonte}>
            <span className="whitespace-pre">Modalidade/Etapa: </span>
            {nivel ? (
              <span
                className="max-w-full truncate font-bold text-white"
                style={{
                  backgroundColor: getCourseColor(context.contexto.nivel),
                  borderRadius: mm(0.9),
                  padding: `0 ${mm(1.4)}`,
                }}
              >
                {nivel}
              </span>
            ) : (
              "—"
            )}
          </p>
          <p className="line-clamp-2 break-words" style={{ ...fonte, marginTop: mm(0.4) }}>
            Série | Turma | Turno: {etiquetasSerieTurmaTurnoLine(context).toUpperCase()}
          </p>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col border-t border-black"
          style={{ marginTop: mm(0.6), paddingTop: mm(1.5) }}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EtiquetaRichTextPreview
              text={label.textoLivre}
              align={label.textoLivreAlinhamento}
              color={freeColor}
              fontSizeCss={escala.pt(plano.fonteTextoLivre)}
              className="w-full text-black"
            />
          </div>
        </div>

        <AplicadoresRodape label={label} plano={plano} escala={escala} />
      </div>
    </div>
  );
}
