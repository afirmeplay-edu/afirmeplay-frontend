import { LabelList } from "recharts";
import type { MunicipalReferenceSegment } from "@/utils/reports/presentation19/municipalReferenceLine";
import { isMunicipalScopeAverageLabel } from "@/utils/reports/presentation19/municipalReferenceLine";

type MunicipalReferenceLineSegmentProps = {
  segment: MunicipalReferenceSegment | null;
  /** dataKey da `<Bar>` pai (obrigatório — renderiza dentro da barra). */
  dataKey: string;
  /** Chave da categoria no payload (ex.: `label`, `turma`, `name`). */
  categoryKey?: string;
  stroke?: string;
  strokeWidth?: number;
};

type LabelListContentProps = {
  x?: number;
  y?: number;
  width?: number;
  payload?: Record<string, unknown>;
  viewBox?: { width?: number };
};

/**
 * Linha tracejada no **topo da barra municipal** (coordenada `y` do retângulo da barra),
 * não no rótulo numérico acima. Deve ser filho de `<Bar>`.
 */
export function MunicipalReferenceLineSegment({
  segment,
  dataKey,
  categoryKey = "label",
  stroke = "#64748b",
  strokeWidth = 2,
}: MunicipalReferenceLineSegmentProps) {
  if (!segment) return null;

  const anchorCategory = isMunicipalScopeAverageLabel(segment.xStart)
    ? segment.xStart
    : segment.xEnd;
  const municipalAtStart = isMunicipalScopeAverageLabel(segment.xStart);

  return (
    <LabelList
      dataKey={dataKey}
      content={(props: LabelListContentProps) => {
        const cat = String(
          props.payload?.[categoryKey] ??
            props.payload?.label ??
            props.payload?.name ??
            props.payload?.turma ??
            ""
        );
        if (cat !== anchorCategory && !isMunicipalScopeAverageLabel(cat)) return null;

        const x = Number(props.x ?? 0);
        const y = Number(props.y ?? 0);
        const width = Number(props.width ?? 0);
        const plotW = Number(props.viewBox?.width ?? 0);
        const centerX = x + width / 2;
        const x1 = municipalAtStart ? centerX : 0;
        const x2 = municipalAtStart ? plotW : centerX;

        return (
          <line
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        );
      }}
    />
  );
}
