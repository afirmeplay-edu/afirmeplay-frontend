import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import type { ProcessedEvolutionData } from './EvolutionCharts';
import type { ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionData } from './EvolutionChart';

interface EvolutionPDFLayoutProps {
  processedData: ProcessedEvolutionData;
  comparisonData: ComparisonResponse | null;
  evaluationNames: string[];
}

// Paleta de cores personalizada
const customColors = ['#81338A', '#758E4F', '#F6AE2D', '#33658A', '#86BBD8'];
const proficiencyColors = ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0'];

// Função para obter cor baseada no índice
const getColorByIndex = (index: number): string => {
  return customColors[index % customColors.length];
};

// Função para obter domínio de proficiência baseado na disciplina
const getProficiencyDomain = (subjectName: string): [number, number] => {
  if (subjectName.toLowerCase().includes('matemática') || 
      subjectName.toLowerCase().includes('matematica') ||
      subjectName.toLowerCase().includes('math')) {
    return [0, 425];
  }
  return [0, 400];
};

// Função para obter cores para disciplinas
const getSubjectColors = (subjectName: string, subjectIndex: number) => {
  const subjectColorMap: { [key: string]: string } = {
    'matemática': '#0077B6',
    'matematica': '#0077B6',
    'math': '#0077B6',
    'língua portuguesa': '#E63946',
    'lingua portuguesa': '#E63946',
    'português': '#E63946',
    'portugues': '#E63946',
    'ciências': '#2A9D8F',
    'ciencias': '#2A9D8F',
    'história': '#8D6E63',
    'historia': '#8D6E63',
    'geografia': '#6B8E23',
  };

  const baseColor = Object.keys(subjectColorMap).find(key => 
    subjectName.toLowerCase().includes(key.toLowerCase())
  );

  return baseColor ? subjectColorMap[baseColor] : customColors[subjectIndex % customColors.length];
};

function safe(n?: number | null): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function pct(from?: number, to?: number): number | undefined {
  const a = safe(from);
  const b = safe(to);
  if (a === undefined || b === undefined) return undefined;
  if (a === 0) return b === 0 ? 0 : 100;
  return ((b - a) / a) * 100;
}

type SegmentedRow<T> = T & {
  up?: number | null;
  down?: number | null;
  flat?: number | null;
};

function segmentLine<T extends Record<string, unknown>>(
  rows: T[],
  key: 'nota' | 'proficiencia' | 'quantidade',
  threshold = 0.1
): SegmentedRow<T>[] {
  if (!rows || rows.length === 0) return [];
  const up: (number | null)[] = Array(rows.length).fill(null);
  const down: (number | null)[] = Array(rows.length).fill(null);
  const flat: (number | null)[] = Array(rows.length).fill(null);

  for (let i = 1; i < rows.length; i++) {
    const prev = safe(Number(rows[i - 1]?.[key]));
    const cur = safe(Number(rows[i]?.[key]));
    
    if (prev === undefined || cur === undefined) continue;

    if (cur > prev + threshold) {
      up[i - 1] = prev; up[i] = cur;
    } else if (cur < prev - threshold) {
      down[i - 1] = prev; down[i] = cur;
    } else {
      flat[i - 1] = prev; flat[i] = cur;
    }
  }

  return rows.map((r, idx) => ({
    ...r,
    up: up[idx],
    down: down[idx],
    flat: flat[idx],
  })) as SegmentedRow<T>[];
}

const makeDeltaLabelRenderer = (
  data: Array<Record<string, unknown>>,
  valueKey: 'nota' | 'proficiencia' | 'quantidade',
  segmentKey: 'up' | 'down' | 'flat'
) => (props: { x?: number; y?: number; index?: number }) => {
  const { x, y, index } = props;
  
  if (index === 0 || x === undefined || y === undefined) return null;

  const cur = data[index];
  const prev = data[index - 1];

  const curSeg = safe(cur?.[segmentKey] as number);
  if (curSeg === undefined) return null;

  const from = safe(prev?.[valueKey] as number);
  const to = safe(cur?.[valueKey] as number);
  const d = pct(from, to);
  if (d === undefined) return null;

  const color = d > 0 ? '#10B981' : d < 0 ? '#EF4444' : '#6B7280';
  const text = `${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;

  return (
    <g>
      <text
        x={x}
        y={Math.max(y - 20, 20)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill={color}
        stroke="#ffffff"
        strokeWidth={2}
        paintOrder="stroke fill"
      >
        {text}
      </text>
    </g>
  );
};

function mergeByName(rows: EvolutionData[]): EvolutionData[] {
  const map = new Map<string, EvolutionData>();
  for (const r of rows) {
    const key = (r?.name || 'Geral').trim();
    const cur = map.get(key) || { name: key };
    const merged: any = { name: key };
    
    for (let i = 1; i <= 10; i++) {
      const etapaKey = `etapa${i}`;
      merged[etapaKey] = safe((r as any)[etapaKey]) ?? (cur as any)[etapaKey];
    }
    
    for (let i = 1; i <= 9; i++) {
      const variacaoKey = `variacao_${i}_${i + 1}`;
      merged[variacaoKey] = safe((r as any)[variacaoKey]) ?? (cur as any)[variacaoKey];
    }
    
    map.set(key, merged);
  }
  
  for (const v of map.values()) {
    for (let i = 1; i <= 9; i++) {
      const variacaoKey = `variacao_${i}_${i + 1}`;
      const etapa1Key = `etapa${i}`;
      const etapa2Key = `etapa${i + 1}`;
      if ((v as any)[variacaoKey] === undefined) {
        (v as any)[variacaoKey] = pct((v as any)[etapa1Key], (v as any)[etapa2Key]);
      }
    }
  }
  return [...map.values()];
}

// Calcular estatísticas gerais
function calculateGeneralStats(processedData: ProcessedEvolutionData) {
  if (!processedData.generalData || processedData.generalData.length === 0) return null;
  
  const merged = mergeByName(processedData.generalData);
  if (merged.length === 0) return null;
  
  const r = merged[0];
  const etapas: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const etapaKey = `etapa${i}`;
    const value = safe((r as any)[etapaKey]);
    if (value !== undefined) {
      etapas.push(value);
    }
  }
  
  if (etapas.length === 0) return null;
  
  const media = etapas.reduce((sum, val) => sum + val, 0) / etapas.length;
  const variacaoTotal = etapas.length > 1 ? pct(etapas[0], etapas[etapas.length - 1]) : 0;
  
  return {
    media,
    variacaoTotal: variacaoTotal || 0,
    totalAvaliacoes: etapas.length,
  };
}

export const EvolutionPDFLayout = ({ processedData, evaluationNames }: EvolutionPDFLayoutProps) => {
  // Calcular estatísticas gerais
  const generalStats = useMemo(() => calculateGeneralStats(processedData), [processedData]);

  // Dados para gráfico de notas (geral)
  const chartData = useMemo(() => {
    const merged = mergeByName(processedData.generalData || []);
    if (merged.length === 0) return [];
    
    const r = merged[0];
    const chartDataArray: Record<string, unknown>[] = [];
    
    evaluationNames.forEach((evalName, index) => {
      const etapaKey = `etapa${index + 1}`;
      const etapaValue = safe((r as any)[etapaKey]);
      
      if (etapaValue !== undefined) {
        let variacao = 0;
        if (index > 0) {
          const variacaoKey = `variacao_${index}_${index + 1}`;
          const variacaoValue = safe((r as any)[variacaoKey]);
          if (variacaoValue !== undefined) {
            variacao = variacaoValue;
          } else {
            const prevEtapaKey = `etapa${index}`;
            const prevValue = safe((r as any)[prevEtapaKey]);
            if (prevValue !== undefined && prevValue > 0) {
              variacao = ((etapaValue - prevValue) / prevValue) * 100;
            }
          }
        }
        
        chartDataArray.push({
          name: evalName,
          nota: etapaValue,
          variacao: variacao,
          color: getColorByIndex(index),
        });
      }
    });
    
    return chartDataArray;
  }, [processedData, evaluationNames]);

  const segmentedGeneral = useMemo(
    () => segmentLine(chartData as Record<string, unknown>[], 'nota'),
    [chartData]
  );

  // Dados para gráfico de proficiência (geral)
  const proficiencyChartData = useMemo(() => {
    const merged = mergeByName(processedData.proficiencyData || []);
    if (merged.length === 0) return [];
    
    const r = merged[0];
    const chartDataArray: Record<string, unknown>[] = [];
    
    evaluationNames.forEach((evalName, index) => {
      const etapaKey = `etapa${index + 1}`;
      const etapaValue = safe((r as any)[etapaKey]);
      
      if (etapaValue !== undefined) {
        chartDataArray.push({
          name: evalName,
          proficiencia: etapaValue,
          color: proficiencyColors[index % proficiencyColors.length],
        });
      }
    });
    
    return chartDataArray;
  }, [processedData, evaluationNames]);

  const segmentedProficiency = useMemo(
    () => segmentLine(proficiencyChartData as Record<string, unknown>[], 'proficiencia'),
    [proficiencyChartData]
  );

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
      const barData = payload.find((p: any) => p.dataKey === 'nota');
      if (barData) {
        const nota = barData.value;
        const variacao = barData.payload.variacao;
        const sinal = variacao > 0 ? '+' : '';
        
        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
            <p className="text-sm text-gray-700">
              Nota: <span className="font-semibold">{nota.toFixed(1).replace('.', ',')}</span>
            </p>
            <p className={`text-sm font-medium ${
              variacao > 0 ? 'text-green-600' : variacao < 0 ? 'text-red-600' : 'text-gray-700'
            }`}>
              Variação: {sinal}{variacao.toFixed(1)}%
            </p>
          </div>
        );
      }
    }
    return null;
  };

  const CustomProficiencyTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
      const barData = payload.find((p: any) => p.dataKey === 'proficiencia');
      if (barData) {
        const proficiencia = barData.value;
        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
            <p className="text-sm text-gray-700">
              Proficiência: <span className="font-semibold">{proficiencia.toFixed(1).replace('.', ',')}</span>
            </p>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <div 
      className="evolution-pdf-layout" 
      style={{ 
        width: '210mm', 
        minHeight: '297mm',
        backgroundColor: '#ffffff',
        padding: '0',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000000',
        boxSizing: 'border-box',
        overflow: 'visible',
        pageBreakInside: 'auto',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
        imageRendering: 'crisp-edges',
        shapeRendering: 'geometricPrecision'
      }}
    >
      {/* Cabeçalho */}
      <div data-pdf-section="header" style={{ marginBottom: '20px', marginTop: '15mm', textAlign: 'center', borderBottom: '2px solid #2563eb', paddingBottom: '12px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb', marginBottom: '8px', marginTop: '0' }}>
          ANÁLISE DE EVOLUÇÃO
        </h1>
        <p style={{ fontSize: '10px', color: '#666666', margin: '0' }}>
          {evaluationNames.join(' • ')}
        </p>
      </div>

      {/* Resumo Estatístico */}
      {generalStats && (
        <div data-pdf-section="summary" style={{ marginBottom: '18px', pageBreakInside: 'avoid', pageBreakAfter: 'avoid' }}>
          <h2 style={{ 
            fontSize: '13px', 
            fontWeight: 'bold', 
            marginBottom: '10px', 
            color: '#1f2937', 
            marginTop: '0',
            pageBreakAfter: 'avoid',
            lineHeight: '1.3'
          }}>
            Resumo Estatístico
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '10px',
            marginBottom: '15px'
          }}>
            <div style={{ 
              padding: '12px', 
              border: '1px solid #e5e7eb', 
              borderRadius: '6px',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px' }}>Média Geral</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', lineHeight: '1.2' }}>
                {generalStats.media.toFixed(1).replace('.', ',')}
              </div>
              <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '2px' }}>pontos</div>
            </div>
            <div style={{ 
              padding: '12px', 
              border: '1px solid #e5e7eb', 
              borderRadius: '6px',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px' }}>Variação</div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold',
                color: generalStats.variacaoTotal > 0 ? '#10b981' : generalStats.variacaoTotal < 0 ? '#ef4444' : '#1f2937',
                lineHeight: '1.2'
              }}>
                {generalStats.variacaoTotal > 0 ? '+' : ''}{generalStats.variacaoTotal.toFixed(1)}%
              </div>
              <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '2px' }}>período</div>
            </div>
            <div style={{ 
              padding: '12px', 
              border: '1px solid #e5e7eb', 
              borderRadius: '6px',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '4px' }}>Total de Avaliações</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', lineHeight: '1.2' }}>
                {generalStats.totalAvaliacoes}
              </div>
              <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '2px' }}>avaliações</div>
            </div>
          </div>
        </div>
      )}

      {/* Gráficos Gerais */}
      <div data-pdf-section="general-charts" style={{ marginBottom: '20px', pageBreakAfter: 'avoid' }}>
        <h2 style={{ 
          fontSize: '13px', 
          fontWeight: 'bold', 
          marginBottom: '12px', 
          color: '#1f2937', 
          marginTop: '0',
          pageBreakAfter: 'avoid',
          lineHeight: '1.3'
        }}>
          Gráficos Gerais
        </h2>

        {/* Gráfico de Nota Geral */}
        {chartData.length > 0 && (
          <div style={{ 
            marginBottom: '15px', 
            pageBreakInside: 'avoid', 
            pageBreakAfter: 'avoid',
            pageBreakBefore: 'auto',
            minHeight: '200px'
          }}>
            <h3 style={{ 
              fontSize: '11px', 
              fontWeight: 'bold', 
              marginBottom: '6px', 
              color: '#374151', 
              marginTop: '0',
              pageBreakAfter: 'avoid',
              lineHeight: '1.2'
            }}>
              Nota Geral
            </h3>
            <div style={{ height: '180px', width: '100%', minHeight: '180px', pageBreakInside: 'avoid' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={segmentedGeneral} margin={{ top: 10, right: 15, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="nota" 
                    name="Nota Média"
                    barSize={40} 
                    radius={[2, 2, 0, 0]}
                    label={{ 
                      position: 'center', 
                      fontSize: 11, 
                      fill: '#ffffff',
                      fontWeight: 'bold',
                      stroke: '#1f2937',
                      strokeWidth: 0.5,
                      formatter: (value: number) => value.toFixed(1).replace('.', ',')
                    }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color as string} />
                    ))}
                  </Bar>
                  <Line
                    type="linear"
                    dataKey="up"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'up')} />
                  </Line>
                  <Line
                    type="linear"
                    dataKey="down"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'down')} />
                  </Line>
                  <Line
                    type="linear"
                    dataKey="flat"
                    stroke="#6B7280"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'flat')} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Legenda do gráfico de Nota Geral */}
            <div style={{ 
              marginTop: '8px', 
              padding: '8px 12px', 
              backgroundColor: '#f9fafb', 
              border: '1px solid #e5e7eb', 
              borderRadius: '4px',
              fontSize: '9px',
              color: '#374151',
              lineHeight: '1.5'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '18px', height: '14px', backgroundColor: '#81338A', borderRadius: '2px' }}></div>
                  <span><strong>Barras:</strong> Nota média por avaliação</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#10B981' }}></div>
                  <span><strong>Verde:</strong> Crescimento</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#EF4444' }}></div>
                  <span><strong>Vermelho:</strong> Queda</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#6B7280' }}></div>
                  <span><strong>Cinza:</strong> Estável</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#10B981' }}>+X%</span>
                  <span>Variação percentual</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gráfico de Proficiência Geral */}
        {proficiencyChartData.length > 0 && (
          <div style={{ 
            marginBottom: '15px', 
            pageBreakInside: 'avoid', 
            pageBreakAfter: 'avoid',
            pageBreakBefore: 'auto',
            minHeight: '200px'
          }}>
            <h3 style={{ 
              fontSize: '11px', 
              fontWeight: 'bold', 
              marginBottom: '6px', 
              color: '#374151', 
              marginTop: '0',
              pageBreakAfter: 'avoid',
              lineHeight: '1.2'
            }}>
              Proficiência Geral
            </h3>
            <div style={{ height: '180px', width: '100%', minHeight: '180px', pageBreakInside: 'avoid' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={segmentedProficiency} margin={{ top: 10, right: 15, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    domain={[0, 425]} 
                    tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }} 
                    tickFormatter={(value) => value.toFixed(0)}
                  />
                  <Tooltip content={<CustomProficiencyTooltip />} />
                  <Bar
                    dataKey="proficiencia"
                    name="Proficiência"
                    barSize={40} 
                    radius={[2, 2, 0, 0]}
                    label={{ 
                      position: 'center', 
                      fontSize: 11, 
                      fill: '#ffffff',
                      fontWeight: 'bold',
                      stroke: '#1f2937',
                      strokeWidth: 0.5,
                      formatter: (value: number) => value.toFixed(1).replace('.', ',')
                    }}
                  >
                    {proficiencyChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color as string} />
                    ))}
                  </Bar>
                  <Line
                    type="linear"
                    dataKey="up"
                    stroke="#059669"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'up')} />
                  </Line>
                  <Line
                    type="linear"
                    dataKey="down"
                    stroke="#DC2626"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'down')} />
                  </Line>
                  <Line
                    type="linear"
                    dataKey="flat"
                    stroke="#1f2937"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'flat')} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Legenda do gráfico de Proficiência Geral */}
            <div style={{ 
              marginTop: '8px', 
              padding: '8px 12px', 
              backgroundColor: '#f9fafb', 
              border: '1px solid #e5e7eb', 
              borderRadius: '4px',
              fontSize: '9px',
              color: '#374151',
              lineHeight: '1.5'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '18px', height: '14px', backgroundColor: '#059669', borderRadius: '2px' }}></div>
                  <span><strong>Barras:</strong> Proficiência por avaliação</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#059669' }}></div>
                  <span><strong>Verde:</strong> Crescimento</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#DC2626' }}></div>
                  <span><strong>Vermelho:</strong> Queda</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '3px', backgroundColor: '#1f2937' }}></div>
                  <span><strong>Cinza:</strong> Estável</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#059669' }}>+X%</span>
                  <span>Variação percentual</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gráficos por Disciplina */}
      {Object.keys(processedData.subjectData || {}).length > 0 && (
        <div style={{ marginTop: '20px', pageBreakBefore: 'always', pageBreakAfter: 'avoid' }}>
          <h2 style={{ 
            fontSize: '13px', 
            fontWeight: 'bold', 
            marginBottom: '12px', 
            color: '#1f2937', 
            marginTop: '0',
            pageBreakAfter: 'avoid',
            lineHeight: '1.3'
          }}>
            Gráficos por Disciplina
          </h2>
          {Object.entries(processedData.subjectData).map(([subject, rows], subjectIndex) => {
            const merged = mergeByName(rows);
            if (merged.length === 0) return null;
            
            const r = merged[0];
            const subjectChartData: Record<string, unknown>[] = [];
            const subjectColor = getSubjectColors(subject, subjectIndex);
            
            evaluationNames.forEach((evalName, index) => {
              const etapaKey = `etapa${index + 1}`;
              const etapaValue = safe((r as any)[etapaKey]);
              
              if (etapaValue !== undefined) {
                subjectChartData.push({
                  name: evalName,
                  nota: etapaValue,
                  color: subjectColor,
                });
              }
            });

            if (subjectChartData.length === 0) return null;

            const subjectSegmented = segmentLine(subjectChartData as Record<string, unknown>[], 'nota');

            // Dados de proficiência para esta disciplina
            const subjectProficiencyData = processedData.subjectProficiencyData[subject] || [];
            const mergedProficiency = mergeByName(subjectProficiencyData);
            const proficiencyChartData: Record<string, unknown>[] = [];
            
            if (mergedProficiency.length > 0) {
              const prof = mergedProficiency[0];
              evaluationNames.forEach((evalName, index) => {
                const etapaKey = `etapa${index + 1}`;
                const etapaValue = safe((prof as any)[etapaKey]);
                
                if (etapaValue !== undefined) {
                  proficiencyChartData.push({
                    name: evalName,
                    proficiencia: etapaValue,
                    color: subjectColor,
                  });
                }
              });
            }

            const subjectProfSegmented = segmentLine(proficiencyChartData as Record<string, unknown>[], 'proficiencia');

            return (
              <div 
                key={subject} 
                data-pdf-section={`subject-${subject.replace(/[^a-zA-Z0-9]/g, '-')}`}
                style={{ 
                  marginBottom: '20px',
                  pageBreakInside: 'avoid', 
                  pageBreakAfter: 'avoid',
                  pageBreakBefore: 'auto',
                  minHeight: '400px'
                }}
              >
                <h3 style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  marginBottom: '10px', 
                  color: '#374151', 
                  marginTop: '0',
                  pageBreakAfter: 'avoid',
                  lineHeight: '1.2'
                }}>
                  {subject}
                </h3>
                
                {/* Gráfico de Notas */}
                <div style={{ 
                  marginBottom: '15px', 
                  pageBreakInside: 'avoid',
                  pageBreakBefore: 'auto',
                  minHeight: '180px'
                }}>
                  <h4 style={{ 
                    fontSize: '10px', 
                    fontWeight: '600', 
                    marginBottom: '6px', 
                    color: '#6b7280', 
                    marginTop: '0',
                    pageBreakAfter: 'avoid',
                    lineHeight: '1.2'
                  }}>
                    Notas
                  </h4>
                  <div style={{ height: '160px', width: '100%', minHeight: '160px', pageBreakInside: 'avoid' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={subjectSegmented} margin={{ top: 10, right: 15, left: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                          angle={-25}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar 
                          dataKey="nota" 
                          name="Nota Média"
                          barSize={40} 
                          radius={[2, 2, 0, 0]}
                          label={{ 
                            position: 'center', 
                            fontSize: 11, 
                            fill: '#ffffff',
                            fontWeight: 'bold',
                            stroke: '#1f2937',
                            strokeWidth: 0.5,
                            formatter: (value: number) => value.toFixed(1).replace('.', ',')
                          }}
                        >
                          {subjectChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color as string} />
                          ))}
                        </Bar>
                        <Line
                          type="linear"
                          dataKey="up"
                          stroke="#10B981"
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                        >
                          <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'up')} />
                        </Line>
                        <Line
                          type="linear"
                          dataKey="down"
                          stroke="#EF4444"
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                        >
                          <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'down')} />
                        </Line>
                        <Line
                          type="linear"
                          dataKey="flat"
                          stroke="#6B7280"
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                        >
                          <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'flat')} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legenda do gráfico de Notas por Disciplina */}
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px 12px', 
                    backgroundColor: '#f9fafb', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#374151',
                    lineHeight: '1.5'
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '18px', height: '14px', backgroundColor: subjectColor, borderRadius: '2px' }}></div>
                        <span><strong>Barras:</strong> Nota média</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '24px', height: '3px', backgroundColor: '#10B981' }}></div>
                        <span><strong>Verde:</strong> Crescimento</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '24px', height: '3px', backgroundColor: '#EF4444' }}></div>
                        <span><strong>Vermelho:</strong> Queda</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '24px', height: '3px', backgroundColor: '#6B7280' }}></div>
                        <span><strong>Cinza:</strong> Estável</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gráfico de Proficiência (se disponível) */}
                {proficiencyChartData.length > 0 && (
                  <div style={{ 
                    marginBottom: '15px', 
                    pageBreakInside: 'avoid',
                    pageBreakBefore: 'auto',
                    minHeight: '180px'
                  }}>
                    <h4 style={{ 
                      fontSize: '10px', 
                      fontWeight: '600', 
                      marginBottom: '6px', 
                      color: '#6b7280', 
                      marginTop: '0',
                      pageBreakAfter: 'avoid',
                      lineHeight: '1.2'
                    }}>
                      Proficiência
                    </h4>
                    <div style={{ height: '160px', width: '100%', minHeight: '160px', pageBreakInside: 'avoid' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={subjectProfSegmented} margin={{ top: 10, right: 15, left: 10, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                            angle={-25}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis 
                            domain={getProficiencyDomain(subject)} 
                            tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }} 
                            tickFormatter={(value) => value.toFixed(0)}
                          />
                          <Tooltip content={<CustomProficiencyTooltip />} />
                          <Bar
                            dataKey="proficiencia"
                            name="Proficiência"
                            barSize={40}
                            radius={[2, 2, 0, 0]}
                            label={{ 
                              position: 'center', 
                              fontSize: 11, 
                              fill: '#ffffff',
                              fontWeight: 'bold',
                              stroke: '#1f2937',
                              strokeWidth: 0.5,
                              formatter: (value: number) => value.toFixed(1).replace('.', ',')
                            }}
                          >
                            {proficiencyChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color as string} />
                            ))}
                          </Bar>
                          <Line
                            type="linear"
                            dataKey="up"
                            stroke="#10B981"
                            strokeWidth={2.5}
                            dot={false}
                            isAnimationActive={false}
                          >
                            <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'up')} />
                          </Line>
                          <Line
                            type="linear"
                            dataKey="down"
                            stroke="#EF4444"
                            strokeWidth={2.5}
                            dot={false}
                            isAnimationActive={false}
                          >
                            <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'down')} />
                          </Line>
                          <Line
                            type="linear"
                            dataKey="flat"
                            stroke="#6B7280"
                            strokeWidth={2.5}
                            dot={false}
                            isAnimationActive={false}
                          >
                            <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'flat')} />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legenda do gráfico de Proficiência por Disciplina */}
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px 12px', 
                      backgroundColor: '#f9fafb', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '4px',
                      fontSize: '9px',
                      color: '#374151',
                      lineHeight: '1.5'
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '18px', height: '14px', backgroundColor: subjectColor, borderRadius: '2px' }}></div>
                          <span><strong>Barras:</strong> Proficiência</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '24px', height: '3px', backgroundColor: '#10B981' }}></div>
                          <span><strong>Verde:</strong> Crescimento</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '24px', height: '3px', backgroundColor: '#EF4444' }}></div>
                          <span><strong>Vermelho:</strong> Queda</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '24px', height: '3px', backgroundColor: '#6B7280' }}></div>
                          <span><strong>Cinza:</strong> Estável</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Gráficos por Níveis */}
      {Object.keys(processedData.levelsData || {}).length > 0 && (
        <div style={{ marginTop: '20px', pageBreakBefore: 'always', pageBreakAfter: 'avoid' }}>
          <h2 style={{ 
            fontSize: '13px', 
            fontWeight: 'bold', 
            marginBottom: '12px', 
            color: '#1f2937', 
            marginTop: '0',
            pageBreakAfter: 'avoid',
            lineHeight: '1.3'
          }}>
            Gráficos por Níveis de Proficiência
          </h2>
          {Object.entries(processedData.levelsData).map(([levelName, rows]) => {
            const merged = mergeByName(rows);
            if (merged.length === 0) return null;
            
            const r = merged[0];
            const levelChartData: Record<string, unknown>[] = [];
            
            const levelColors: Record<string, string> = {
              'Abaixo do Básico': '#DC2626',
              'Básico': '#F59E0B',
              'Adequado': '#4ade80',
              'Avançado': '#16A34A',
            };
            
            const levelColor = levelColors[levelName] || '#6B7280';
            
            evaluationNames.forEach((evalName, index) => {
              const etapaKey = `etapa${index + 1}`;
              const etapaValue = safe((r as any)[etapaKey]);
              
              if (etapaValue !== undefined) {
                levelChartData.push({
                  name: evalName,
                  quantidade: etapaValue,
                  color: levelColor,
                });
              }
            });

            if (levelChartData.length === 0) return null;

            const levelSegmented = segmentLine(levelChartData as Record<string, unknown>[], 'quantidade');

            const CustomLevelTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
              if (active && payload && payload.length) {
                const barData = payload.find((p: any) => p.dataKey === 'quantidade');
                if (barData) {
                  const quantidade = barData.value as number;
                  return (
                    <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-sm">
                      <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
                      <p className="text-sm text-gray-700">
                        Alunos: <span className="font-semibold">{quantidade}</span>
                      </p>
                    </div>
                  );
                }
              }
              return null;
            };

            return (
              <div 
                key={levelName} 
                data-pdf-section={`level-${levelName.replace(/[^a-zA-Z0-9]/g, '-')}`}
                style={{ 
                  marginBottom: '15px',
                  pageBreakInside: 'avoid', 
                  pageBreakAfter: 'avoid',
                  pageBreakBefore: 'auto',
                  minHeight: '180px'
                }}
              >
                <h3 style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  marginBottom: '6px', 
                  color: '#374151', 
                  marginTop: '0',
                  pageBreakAfter: 'avoid',
                  lineHeight: '1.2'
                }}>
                  {levelName}
                </h3>
                <div style={{ height: '160px', width: '100%', minHeight: '160px', pageBreakInside: 'avoid' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={levelSegmented} margin={{ top: 10, right: 15, left: 10, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                        angle={-25}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis 
                        domain={[0, 'dataMax + 5']} 
                        tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }} 
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomLevelTooltip />} />
                      <Bar
                        dataKey="quantidade"
                        name="Quantidade de Alunos"
                        barSize={40}
                        radius={[2, 2, 0, 0]}
                        label={{ 
                          position: 'center', 
                          fontSize: 11, 
                          fill: '#ffffff',
                          fontWeight: 'bold',
                          stroke: '#1f2937',
                          strokeWidth: 0.5,
                          formatter: (value: number) => value.toFixed(0)
                        }}
                      >
                        {levelChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color as string} />
                        ))}
                      </Bar>
                      <Line
                        type="linear"
                        dataKey="up"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'up')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="down"
                        stroke="#EF4444"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'down')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="flat"
                        stroke="#6B7280"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'flat')} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Legenda do gráfico de Níveis de Proficiência */}
                <div style={{ 
                  marginTop: '8px', 
                  padding: '8px 12px', 
                  backgroundColor: '#f9fafb', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '4px',
                  fontSize: '9px',
                  color: '#374151',
                  lineHeight: '1.5'
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '18px', height: '14px', backgroundColor: levelColor, borderRadius: '2px' }}></div>
                      <span><strong>Barras:</strong> Alunos no nível "{levelName}"</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '24px', height: '3px', backgroundColor: '#10B981' }}></div>
                      <span><strong>Verde:</strong> Aumento</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '24px', height: '3px', backgroundColor: '#EF4444' }}></div>
                      <span><strong>Vermelho:</strong> Diminuição</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '24px', height: '3px', backgroundColor: '#6B7280' }}></div>
                      <span><strong>Cinza:</strong> Estável</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
