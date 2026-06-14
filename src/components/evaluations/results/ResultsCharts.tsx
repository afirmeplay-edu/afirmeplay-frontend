import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChartComponent, DonutChartComponent } from "@/components/ui/charts";

// ✅ TIPOS MAIS ESPECÍFICOS
type StageGroup = "group1" | "group2";

interface ChartData {
  averageScoreData: Array<{ name: string; value: number }>;
  averageProficiencyData: Array<{ name: string; value: number }>;
  distributionData: Array<{
    disciplina: string;
    data: Array<{ name: string; value: number }>;
    donutColors?: string[];
  }>;
  proficiencyMax: number;
  scopeAverageLabel: string;
}

/** Fonte dos gráficos por disciplina: `estatisticas_gerais.por_disciplina` (backend). */
interface ChartsApiData {
  estatisticas_gerais?: {
    tipo?: string;
    media_nota_geral?: number;
    media_proficiencia_geral?: number;
    por_disciplina?: Array<{
      disciplina: string;
      media_nota: number;
      media_proficiencia: number;
      distribuicao_classificacao?: Record<string, number>;
    }>;
  };
}

function resolveScopeAverageLabel(tipo?: string): string {
  const t = String(tipo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return t === "municipio" ? "Municipal" : "Geral";
}

const DONUT_SLICE_COLORS = [
  "#dc2626",
  "#eab308",
  "#22c55e",
  "#15803d",
  "#6366f1",
  "#a855f7",
  "#f97316",
  "#0ea5e9",
];

function normalizeDiscKey(disc: string): string {
  return String(disc || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Monta fatias do donut a partir do objeto do backend (sem agregar médias). */
function donutSlicesFromDistribuicao(
  dist: Record<string, number> | undefined
): Array<{ name: string; value: number }> {
  if (!dist || typeof dist !== "object") return [];
  const d = dist as Record<string, unknown>;
  const hasStandard =
    "abaixo_do_basico" in d ||
    "basico" in d ||
    "adequado" in d ||
    "avancado" in d;
  if (hasStandard) {
    return [
      { name: "Abaixo do Básico", value: Number(d.abaixo_do_basico) || 0 },
      { name: "Básico", value: Number(d.basico) || 0 },
      { name: "Adequado", value: Number(d.adequado) || 0 },
      { name: "Avançado", value: Number(d.avancado) || 0 },
    ];
  }
  return Object.entries(dist).map(([name, v]) => ({
    name,
    value: typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0,
  }));
}

interface ChartsEvaluationInfo {
  id: string;
  titulo: string;
  disciplina?: string;
  serie?: string;
  turma?: string;
  escola?: string;
  municipio?: string;
  estado?: string;
  data_aplicacao?: string;
  total_alunos: number;
  alunos_participantes: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
}

interface ResultsChartsProps {
  apiData: ChartsApiData | null;
  evaluationInfo: ChartsEvaluationInfo | null;
  inferStageGroup: () => StageGroup;
  getMaxForDiscipline: (disciplina: string, group: StageGroup) => number;
}

// ✅ HOOK PARA LÓGICA DE DADOS
function useChartData(
  apiData: ChartsApiData | null,
  inferStageGroup: () => StageGroup,
  getMaxForDiscipline: (disciplina: string, group: StageGroup) => number
): ChartData | null {
  return useMemo(() => {
    if (!apiData?.estatisticas_gerais) {
      console.warn("Dados incompletos para gráficos:", apiData);
      return null;
    }

    const porDisciplina = apiData.estatisticas_gerais.por_disciplina ?? [];
    const scopeAverageLabel = resolveScopeAverageLabel(apiData.estatisticas_gerais.tipo);
    // Não duplicar barra agregada quando o backend envia disciplina "GERAL" (cartão-resposta).
    const disciplineItems = porDisciplina.filter(
      (it) => normalizeDiscKey(it.disciplina) !== "geral"
    );

    const createScoreData = () => {
      const scoreData = [
        {
          name: scopeAverageLabel,
          value:
            typeof apiData.estatisticas_gerais!.media_nota_geral === "number"
              ? apiData.estatisticas_gerais!.media_nota_geral
              : 0,
        },
        ...disciplineItems.map((item) => ({
          name: String(item.disciplina || "").toUpperCase(),
          value: typeof item.media_nota === "number" ? item.media_nota : 0,
        })),
      ];
      return scoreData;
    };

    const createProficiencyData = () => {
      const proficiencyData = [
        {
          name: scopeAverageLabel,
          value:
            typeof apiData.estatisticas_gerais!.media_proficiencia_geral === "number"
              ? apiData.estatisticas_gerais!.media_proficiencia_geral
              : 0,
        },
        ...disciplineItems.map((item) => ({
          name: String(item.disciplina || "").toUpperCase(),
          value: typeof item.media_proficiencia === "number" ? item.media_proficiencia : 0,
        })),
      ];
      return proficiencyData;
    };

    const createDistributionData = () => {
      return disciplineItems
        .map((item) => {
          const slices = donutSlicesFromDistribuicao(item.distribuicao_classificacao);
          const total = slices.reduce((s, x) => s + x.value, 0);
          if (total <= 0) return null;
          return {
            disciplina: item.disciplina,
            data: slices,
            donutColors: slices.map((_, i) => DONUT_SLICE_COLORS[i % DONUT_SLICE_COLORS.length]),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    };

    const calculateProficiencyMax = () => {
      const group = inferStageGroup();
      const profMaxCandidates = disciplineItems.length
        ? disciplineItems.map((d) => getMaxForDiscipline(d.disciplina, group))
        : [getMaxForDiscipline("outras", group)];
      return Math.max(...profMaxCandidates);
    };

    return {
      averageScoreData: createScoreData(),
      averageProficiencyData: createProficiencyData(),
      distributionData: createDistributionData(),
      proficiencyMax: calculateProficiencyMax(),
      scopeAverageLabel,
    };
  }, [apiData, inferStageGroup, getMaxForDiscipline]);
}

// ✅ COMPONENTES MENORES
const ScoreChart = ({ data }: { data: ChartData }) => (
  <Card>
    <CardContent className="pt-6">
      <BarChartComponent
        data={data.averageScoreData}
        title="Média de Nota"
        subtitle={`Média de Nota (${data.scopeAverageLabel} + Disciplinas)`}
        color="#22c55e"
        yAxisDomain={[0, 10]}
        yAxisLabel="Nota"
        showValues={true}
        municipalReferenceLine={
          data.averageScoreData.length >= 2
            ? {
                y: data.averageScoreData[0].value,
                anchorName: data.scopeAverageLabel,
              }
            : undefined
        }
      />
    </CardContent>
  </Card>
);

const ProficiencyChart = ({ data }: { data: ChartData }) => (
  <Card>
    <CardContent className="pt-6">
      <BarChartComponent
        data={data.averageProficiencyData}
        title="Média de Proficiência"
        subtitle={`Média de Proficiência (${data.scopeAverageLabel} + Disciplinas)`}
        color="#15803d"
        yAxisDomain={[0, data.proficiencyMax]}
        yAxisLabel="Proficiência"
        showValues={true}
        municipalReferenceLine={
          data.averageProficiencyData.length >= 2
            ? {
                y: data.averageProficiencyData[0].value,
                anchorName: data.scopeAverageLabel,
              }
            : undefined
        }
      />
    </CardContent>
  </Card>
);

const DistributionCharts = ({ data }: { data: ChartData }) => (
  <>
    {data.distributionData.map((item, index) => (
      <Card key={`${item.disciplina}-${index}`}>
        <CardContent className="pt-6">
          <DonutChartComponent
            data={item.data}
            title={item.disciplina.toUpperCase()}
            subtitle="Distribuição de Desempenho"
            colors={item.donutColors}
            showValues={true}
          />
        </CardContent>
      </Card>
    ))}
  </>
);

// ✅ COMPONENTE PRINCIPAL MAIS LIMPO
export function ResultsCharts({
  apiData,
  evaluationInfo: _evaluationInfo,
  inferStageGroup,
  getMaxForDiscipline,
}: ResultsChartsProps) {
  const chartData = useChartData(apiData, inferStageGroup, getMaxForDiscipline);

  if (!chartData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Não há dados suficientes para gerar os gráficos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ScoreChart data={chartData} />
        <ProficiencyChart data={chartData} />
      </div>

      {chartData.distributionData.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <DistributionCharts data={chartData} />
        </div>
      )}
    </div>
  );
}
