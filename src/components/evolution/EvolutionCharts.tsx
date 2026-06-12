import React, { useState, useMemo, useCallback } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  LineChart,
  TrendingUp,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Activity,
  Target,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { EvolutionData } from './EvolutionChart';
import type { EvaluationInfo } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionEvaluationsScopeList } from './EvolutionEvaluationsScopeList';

export interface ProcessedEvolutionData {
  /** "Geral" por etapa (notas) */
  generalData: EvolutionData[];
  /** "Geral" por etapa (proficiência) */
  proficiencyData: EvolutionData[];
  /** "Classificação/Aprovação" geral */
  approvalData: EvolutionData[];
  /** por disciplina (notas) */
  subjectData: Record<string, EvolutionData[]>;
  /** por disciplina (proficiência) */
  subjectProficiencyData: Record<string, EvolutionData[]>;
  /** classificação por disciplina */
  classificationData: Record<string, EvolutionData[]>;
  /** dados por nível de proficiência */
  levelsData: Record<string, EvolutionData[]>;
  /** nomes das avaliações para exibição */
  evaluationNames: string[];
  /** metadados completos (série, turmas, datas) */
  evaluations: EvaluationInfo[];
}

interface EvolutionChartsProps {
  data: ProcessedEvolutionData;
  isLoading?: boolean;
  /** Rótulo plural do instrumento (avaliações / gabaritos). */
  instrumentLabel?: string;
  /** Se true, exibe apenas o conteúdo da aba "Visão Geral" (sem abas Por Disciplina / Por Níveis) */
  onlyOverviewTab?: boolean;
}

const colors = {
  primary: '#2563eb', // azul profissional
  secondary: '#64748b', // cinza neutro
  success: '#059669', // verde profissional
  warning: '#d97706', // laranja profissional
  danger: '#dc2626', // vermelho profissional
  neutral: '#6b7280', // cinza neutro
};

// Paleta de cores personalizada
const customColors = ['#81338A', '#758E4F', '#F6AE2D', '#33658A', '#86BBD8'];

// Paleta específica para proficiência - cores mais fortes e vibrantes
const proficiencyColors = ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0'];

// Função para obter cor baseada no índice
const getColorByIndex = (index: number): string => {
  return customColors[index % customColors.length];
};

// Função para obter domínio de proficiência baseado na disciplina
const getProficiencyDomain = (subjectName: string): [number, number] => {
  // Se for Matemática, usar 425 como máximo
  if (subjectName.toLowerCase().includes('matemática') || 
      subjectName.toLowerCase().includes('matematica') ||
      subjectName.toLowerCase().includes('math')) {
    return [0, 425];
  }
  // Para outras disciplinas, usar 400 como máximo
  return [0, 400];
};

// Função para obter cores para disciplinas baseada no nome da disciplina
const getSubjectColors = (subjectName: string, subjectIndex: number) => {
  // Paleta específica por disciplina
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
    'ciência': '#2A9D8F',
    'ciencia': '#2A9D8F',
    'história': '#8D6E63',
    'historia': '#8D6E63',
    'geografia': '#6B8E23',
    'inglês': '#6A4C93',
    'ingles': '#6A4C93',
    'english': '#6A4C93',
    'educação física': '#F4A261',
    'educacao fisica': '#F4A261',
    'educação fisica': '#F4A261',
    'educacao física': '#F4A261',
    'física': '#F4A261',
    'fisica': '#F4A261',
    'arte': '#E76F51',
    'art': '#E76F51'
  };

  // Buscar cor baseada no nome da disciplina
  const baseColor = Object.keys(subjectColorMap).find(key => 
    subjectName.toLowerCase().includes(key.toLowerCase())
  );

  const primaryColor = baseColor ? subjectColorMap[baseColor] : customColors[subjectIndex % customColors.length];
  
  // Gerar variações da cor principal para as 3 avaliações
  const palette = generateColorVariations(primaryColor);
  
  return {
    bar: palette[0],
    line: palette[1],
    palette: palette,
    primaryColor: primaryColor
  };
};

// Função para gerar variações de uma cor
const generateColorVariations = (baseColor: string): string[] => {
  // Converter hex para RGB
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Gerar variações (mais claro, original, mais escuro)
  const variations = [
    `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`, // Mais claro
    baseColor, // Original
    `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})` // Mais escuro
  ];
  
  return variations;
};

// Função para obter cor da linha baseada na evolução
const getLineColorByEvolution = (data: Record<string, unknown>[]): string => {
  if (data.length < 2) return '#6B7280'; // Cinza se não há dados suficientes
  
  const firstValue = data[0].nota as number || data[0].proficiencia as number || 0;
  const lastValue = data[data.length - 1].nota as number || data[data.length - 1].proficiencia as number || 0;
  
  const difference = lastValue - firstValue;
  const threshold = 0.1; // Threshold para considerar mudança significativa
  
  if (difference > threshold) {
    return '#10B981'; // Verde vibrante para subida
  } else if (difference < -threshold) {
    return '#EF4444'; // Vermelho vibrante para descida
  } else {
    return '#6B7280'; // Cinza para manutenção
  }
};

type SegmentedRow<T> = T & {
  up?: number | null;
  down?: number | null;
  flat?: number | null;
};

/**
 * Quebra a série em 3: up (verde), down (vermelha), flat (cinza).
 * Importante: marca SEMPRE os dois endpoints do segmento (i-1 e i),
 * senão o Recharts não desenha o trecho.
 */
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

function safe(n?: number | null): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function pct(from?: number, to?: number): number | undefined {
  const a = safe(from);
  const b = safe(to);
  if (a === undefined || b === undefined) return undefined;
  if (a === 0) return b === 0 ? 0 : 100; // Se de 0 para qualquer valor > 0, é 100% de crescimento
  return ((b - a) / a) * 100;
}

/**
 * ===========================
 *  RÓTULO DE % ACIMA DA LINHA
 *  ===========================
 *  Gera um renderer que: (1) só desenha no endpoint direito do segmento ativo
 *  e (2) calcula % vs. ponto anterior usando a chave indicada.
 */
const makeDeltaLabelRenderer = (
  data: Array<Record<string, unknown>>,
  valueKey: 'nota' | 'proficiencia' | 'quantidade',
  segmentKey: 'up' | 'down' | 'flat'
) => (props: { x?: number; y?: number; index?: number }) => {
  const { x, y, index } = props;
  
  if (index === 0 || x === undefined || y === undefined) return null;

  const cur = data[index];
  const prev = data[index - 1];

  // Verificar se o segmento atual tem valor (não null/undefined)
  const curSeg = safe(cur?.[segmentKey] as number);
  if (curSeg === undefined) return null;

  const from = safe(prev?.[valueKey] as number);
  const to = safe(cur?.[valueKey] as number);
  const d = pct(from, to);
  if (d === undefined) return null;

  const color = d > 0 ? '#10B981' : d < 0 ? '#EF4444' : '#6B7280';
  const text = `${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;

  // Detectar se está em modo escuro
  const isDarkMode = document.documentElement.classList.contains('dark');
  const strokeColor = isDarkMode ? 'hsl(var(--background))' : '#ffffff';

  return (
    <g>
      <text
        x={x}
        y={Math.max(y - 20, 20)} // Garante que nunca fique muito próximo do topo
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill={color}
        stroke={strokeColor}
        strokeWidth={2}
        paintOrder="stroke fill"
      >
        {text}
      </text>
    </g>
  );
};

type EvolutionDataWithDynamicKeys = EvolutionData & {
  [key: string]: string | number | null | undefined;
};

function mergeByName(rows: EvolutionData[]): EvolutionDataWithDynamicKeys[] {
  const map = new Map<string, EvolutionDataWithDynamicKeys>();
  for (const r of rows) {
    const key = (r?.name || 'Geral').trim();
    const cur = map.get(key) || { name: key };
    const merged: EvolutionDataWithDynamicKeys = { name: key };
    
    // Mesclar todas as etapas dinamicamente (até 10 etapas)
    for (let i = 1; i <= 10; i++) {
      const etapaKey = `etapa${i}`;
      const rValue = (r as EvolutionDataWithDynamicKeys)[etapaKey];
      const curValue = (cur as EvolutionDataWithDynamicKeys)[etapaKey];
      merged[etapaKey] = safe(typeof rValue === 'number' ? rValue : undefined) ?? 
                        (typeof curValue === 'number' ? curValue : undefined);
    }
    
    // Mesclar todas as variações dinamicamente
    for (let i = 1; i <= 9; i++) {
      const variacaoKey = `variacao_${i}_${i + 1}`;
      const rValue = (r as EvolutionDataWithDynamicKeys)[variacaoKey];
      const curValue = (cur as EvolutionDataWithDynamicKeys)[variacaoKey];
      merged[variacaoKey] = safe(typeof rValue === 'number' ? rValue : undefined) ?? 
                           (typeof curValue === 'number' ? curValue : undefined);
    }
    
    map.set(key, merged);
  }
  
  // Calcular variações faltantes dinamicamente
  for (const v of map.values()) {
    for (let i = 1; i <= 9; i++) {
      const variacaoKey = `variacao_${i}_${i + 1}`;
      const etapa1Key = `etapa${i}`;
      const etapa2Key = `etapa${i + 1}`;
      if (v[variacaoKey] === undefined) {
        const etapa1Value = typeof v[etapa1Key] === 'number' ? v[etapa1Key] : undefined;
        const etapa2Value = typeof v[etapa2Key] === 'number' ? v[etapa2Key] : undefined;
        v[variacaoKey] = pct(etapa1Value, etapa2Value);
      }
    }
  }
  return [...map.values()];
}

export function EvolutionCharts({ data, isLoading = false, onlyOverviewTab = false, instrumentLabel = 'avaliações' }: EvolutionChartsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'subjects' | 'levels'>('general');
  const [hiddenByChart, setHiddenByChart] = useState<Record<string, Set<string>>>({});
  const [collapsedCharts, setCollapsedCharts] = useState<Set<string>>(new Set());

  const getHidden = useCallback((chartId: string): Set<string> => {
    return hiddenByChart[chartId] ?? new Set<string>();
  }, [hiddenByChart]);

  function handleToggle(chartId: string, name: string) {
    setHiddenByChart(prev => {
      const current = new Set(prev[chartId] ?? new Set<string>());
      if (current.has(name)) current.delete(name); else current.add(name);
      return { ...prev, [chartId]: current };
    });
  }

  function handleShowAll(chartId: string) {
    setHiddenByChart(prev => ({ ...prev, [chartId]: new Set() }));
  }

  function handleHideAll(chartId: string, names: string[]) {
    setHiddenByChart(prev => ({ ...prev, [chartId]: new Set(names) }));
  }

  function toggleChartCollapse(chartId: string) {
    setCollapsedCharts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chartId)) {
        newSet.delete(chartId);
      } else {
        newSet.add(chartId);
      }
      return newSet;
    });
  }

  function isChartCollapsed(chartId: string): boolean {
    return collapsedCharts.has(chartId);
  }

  // Legenda custom: mantém itens padrão e adiciona toggles minimalistas por avaliação
  function createLegendRenderer(chartId: string, names: string[]) {
    return function LegendRenderer(props: { payload?: Array<{ value?: string; color?: string }>; }) {
      const hidden = getHidden(chartId);
      const payload = (props?.payload || []).filter((p) => p?.value !== 'Nota Média' && p?.value !== 'Proficiência');
      return (
        <div className="mt-2 space-y-2 flex flex-col items-center justify-center">
          {/* Itens padrão da legenda */}
          {payload.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              {payload.map((item, idx) => (
                <div key={`${chartId}-lg-${idx}`} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color || '#9ca3af' }} />
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          )}
          {/* Controles minimalistas por avaliação */}
          {names.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {names.map((name) => {
                const isHidden = hidden.has(name);
                return (
                  <button
                    key={`${chartId}-${name}`}
                    type="button"
                    onClick={() => handleToggle(chartId, name)}
                    className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                      isHidden
                        ? 'bg-card text-muted-foreground border-border'
                        : 'bg-card text-foreground border-border hover:border-border/80'
                    }`}
                    aria-pressed={!isHidden}
                    aria-label={`Alternar visibilidade da avaliação ${name}`}
                    title={isHidden ? `Mostrar ${name}` : `Ocultar ${name}`}
                  >
                    {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <span className="leading-none">{name}</span>
                  </button>
                );
              })}
              <span className="mx-1 text-border text-xs select-none">|</span>
              <button
                type="button"
                onClick={() => handleHideAll(chartId, names)}
                className="px-2 py-0.5 text-[11px] rounded-full border bg-card text-muted-foreground border-border hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-offset-1 inline-flex items-center gap-1"
                aria-label="Ocultar todas as avaliações deste gráfico"
              >
                <EyeOff className="h-3 w-3" /> Ocultar todas
              </button>
              <button
                type="button"
                onClick={() => handleShowAll(chartId)}
                className="px-2 py-0.5 text-[11px] rounded-full border bg-card text-foreground border-border hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-offset-1 inline-flex items-center gap-1"
                aria-label="Mostrar todas as avaliações deste gráfico"
              >
                <Eye className="h-3 w-3" /> Mostrar todas
              </button>
            </div>
          )}
        </div>
      );
    };
  }

  // Calcular estatísticas gerais
  const generalStats = useMemo(() => {
    const merged = mergeByName(data.generalData || []);
    if (merged.length === 0) return null;
    
    const r = merged[0];
    // Coletar todas as etapas dinamicamente
    const etapas: number[] = [];
    const rTyped = r as EvolutionDataWithDynamicKeys;
    for (let i = 1; i <= 10; i++) {
      const etapaKey = `etapa${i}`;
      const value = safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined);
      if (value !== undefined) {
        etapas.push(value);
      }
    }
    
    if (etapas.length === 0) return null;
    
    const media = etapas.reduce((sum, val) => sum + val, 0) / etapas.length;
    const variacaoTotal = etapas.length > 1 ? pct(etapas[0], etapas[etapas.length - 1]) : 0;
    const tendencia = variacaoTotal && variacaoTotal > 0 ? 'up' : variacaoTotal && variacaoTotal < 0 ? 'down' : 'stable';
    
    return {
      media,
      variacaoTotal: variacaoTotal || 0,
      tendencia,
      totalAvaliacoes: etapas.length,
      progresso: Math.min(100, Math.max(0, (media / 10) * 100)),
      metaAlcancada: media >= 7.0,
    };
  }, [data.generalData]);

  // Dados para gráfico de notas (aba geral)
  const chartData = useMemo(() => {
    const chartId = 'general-nota';
    const hidden = getHidden(chartId);
    if (activeTab === 'general') {
      const merged = mergeByName(data.generalData || []);
      if (merged.length === 0) return [];
      
      const r = merged[0];
      const chartDataArray: Record<string, unknown>[] = [];
      
      const rTyped = r as EvolutionDataWithDynamicKeys;

      // Construir dados dinamicamente para todas as avaliações
      data.evaluationNames.forEach((evalName, index) => {
        if (hidden.has(evalName)) return;

        const etapaKey = `etapa${index + 1}`;
        const etapaValue = safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined);

        if (etapaValue !== undefined) {
          // Calcular variação
          let variacao = 0;
          if (index > 0) {
            const variacaoKey = `variacao_${index}_${index + 1}`;
            const variacaoValue = safe(typeof rTyped[variacaoKey] === 'number' ? rTyped[variacaoKey] : undefined);
            if (variacaoValue !== undefined) {
              // Validar variação (limitar valores extremos)
              if (Math.abs(variacaoValue) > 1000) {
                variacao = variacaoValue > 0 ? 1000 : -1000;
              } else {
                variacao = variacaoValue;
              }
            } else {
              // Se não houver variação calculada, calcular manualmente
              const prevEtapaKey = `etapa${index}`;
              const prevValue = safe(typeof rTyped[prevEtapaKey] === 'number' ? rTyped[prevEtapaKey] : undefined);
              if (prevValue !== undefined && prevValue > 0) {
                variacao = ((etapaValue - prevValue) / prevValue) * 100;
                // Validar variação calculada
                if (Math.abs(variacao) > 1000) {
                  variacao = variacao > 0 ? 1000 : -1000;
                }
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
    } else {
      // Para disciplinas, retornar array vazio (será tratado no loop)
      return [];
    }
  }, [data, activeTab, getHidden]);

  // Dados segmentados para gráfico de notas (aba geral)
  const segmentedGeneral = useMemo(
    () => segmentLine(chartData as Record<string, unknown>[], 'nota'),
    [chartData]
  );

  // Dados para gráfico de proficiência (aba geral)
  const proficiencyChartData = useMemo(() => {
    const chartId = 'general-prof';
    const hidden = getHidden(chartId);
    if (activeTab === 'general') {
      const merged = mergeByName(data.proficiencyData || []);
      if (merged.length === 0) return [];
      
      const r = merged[0];
      const rTyped = r as EvolutionDataWithDynamicKeys;
      const chartDataArray: Record<string, unknown>[] = [];
      
      // Construir dados de proficiência dinamicamente para todas as avaliações
      data.evaluationNames.forEach((evalName, index) => {
        if (hidden.has(evalName)) return;
        
        const etapaKey = `etapa${index + 1}`;
        const etapaValue = safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined);
        
        if (etapaValue !== undefined) {
          chartDataArray.push({
            name: evalName,
            proficiencia: etapaValue,
            color: proficiencyColors[index % proficiencyColors.length],
          });
        }
      });
      
      return chartDataArray;
    } else {
      return [];
    }
  }, [data, activeTab, getHidden]);

  // Dados segmentados para gráfico de proficiência (aba geral)
  const segmentedProficiency = useMemo(
    () => segmentLine(proficiencyChartData as Record<string, unknown>[], 'proficiencia'),
    [proficiencyChartData]
  );

  interface TooltipPayload {
    dataKey: string;
    value: number;
    payload: {
      variacao?: number;
      nota?: number;
      proficiencia?: number;
      up?: number | null;
      down?: number | null;
      flat?: number | null;
      [key: string]: unknown;
    };
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (active && payload && payload.length) {
      const barData = payload.find((p: TooltipPayload) => p.dataKey === 'nota');
      if (barData) {
        const nota = barData.value;
        const variacao = barData.payload.variacao;
        const sinal = variacao > 0 ? '+' : '';
        
        return (
          <div className="bg-card p-3 border border-border rounded-lg shadow-sm">
            <p className="text-sm font-medium text-foreground mb-1">{label}</p>
            <p className="text-sm text-foreground">
              Nota: <span className="font-semibold text-foreground">{nota.toFixed(1).replace('.', ',')}</span>
            </p>
            <p className={`text-sm font-medium ${
              variacao > 0 ? 'text-green-600 dark:text-green-400' : variacao < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
            }`}>
              Variação: {sinal}{variacao.toFixed(1)}%
            </p>
          </div>
        );
      }
    }
    return null;
  };

  const CustomProficiencyTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (active && payload && payload.length) {
      const barData = payload.find((p: TooltipPayload) => p.dataKey === 'proficiencia');
      if (barData) {
        const proficiencia = barData.value;
        const data = barData.payload;
        
        // Calcular variação baseada nos dados segmentados
        let variacao = 0;
        let variacaoPontos = 0;
        const currentIndex = payload.findIndex(p => p.payload === data);
        
        if (currentIndex > 0) {
          const prevData = payload[currentIndex - 1]?.payload;
          if (prevData && prevData.proficiencia !== undefined) {
            const prevValue = prevData.proficiencia as number;
            const currentValue = proficiencia as number;
            variacaoPontos = currentValue - prevValue;
            variacao = prevValue > 0 ? ((currentValue - prevValue) / prevValue) * 100 : 0;
          }
        }
        
        const sinal = variacao > 0 ? '+' : '';
        const sinalPontos = variacaoPontos > 0 ? '+' : '';
        
        return (
          <div className="bg-card p-3 border border-border rounded-lg shadow-sm">
            <p className="text-sm font-medium text-foreground mb-1">{label}</p>
            <p className="text-sm text-foreground">
              Proficiência: <span className="font-semibold text-foreground">{proficiencia.toFixed(1).replace('.', ',')}</span>
            </p>
            {variacao !== 0 && (
              <>
                <p className={`text-sm font-medium ${
                  variacao > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  Variação: {sinal}{variacao.toFixed(1)}%
                </p>
                <p className={`text-xs ${
                  variacaoPontos > 0 ? 'text-green-600 dark:text-green-400' : variacaoPontos < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                }`}>
                  {sinalPontos}{variacaoPontos.toFixed(1)} pontos
                </p>
              </>
            )}
          </div>
        );
      }
    }
    return null;
  };

  const CustomSubjectTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (active && payload && payload.length) {
      const barData = payload.find((p: TooltipPayload) => p.dataKey === 'nota' || p.dataKey === 'proficiencia');
      if (barData) {
        const value = barData.value;
        const isProficiency = barData.dataKey === 'proficiencia';
        const metricName = isProficiency ? 'Proficiência' : 'Nota';
        
        // Calcular variação baseada nos dados segmentados
        const data = payload[0]?.payload;
        if (data) {
          const currentValue = isProficiency ? data.proficiencia : data.nota;
          const upValue = data.up;
          const downValue = data.down;
          const flatValue = data.flat;
          
          let variacao = 0;
          let status = '';
          
          if (upValue !== null && upValue !== undefined) {
            status = 'Crescimento';
            // Calcular variação baseada no valor anterior
            const prevIndex = payload.findIndex(p => p.payload === data) - 1;
            if (prevIndex >= 0) {
              const prevData = payload[prevIndex]?.payload;
              if (prevData) {
                const prevValue = isProficiency ? prevData.proficiencia : prevData.nota;
                if (prevValue !== undefined) {
                  variacao = pct(prevValue, currentValue) || 0;
                }
              }
            }
          } else if (downValue !== null && downValue !== undefined) {
            status = 'Queda';
            const prevIndex = payload.findIndex(p => p.payload === data) - 1;
            if (prevIndex >= 0) {
              const prevData = payload[prevIndex]?.payload;
              if (prevData) {
                const prevValue = isProficiency ? prevData.proficiencia : prevData.nota;
                if (prevValue !== undefined) {
                  variacao = pct(prevValue, currentValue) || 0;
                }
              }
            }
          } else if (flatValue !== null && flatValue !== undefined) {
            status = 'Constante';
            const prevIndex = payload.findIndex(p => p.payload === data) - 1;
            if (prevIndex >= 0) {
              const prevData = payload[prevIndex]?.payload;
              if (prevData) {
                const prevValue = isProficiency ? prevData.proficiencia : prevData.nota;
                if (prevValue !== undefined) {
                  variacao = pct(prevValue, currentValue) || 0;
                }
              }
            }
          }

          const sinal = variacao > 0 ? '+' : '';
          const colorClass = variacao > 0 ? 'text-green-600 dark:text-green-400' : variacao < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';

          return (
            <div className="bg-card p-3 border border-border rounded-lg shadow-sm">
              <p className="text-sm font-medium text-foreground mb-1">{label}</p>
              <p className="text-sm text-muted-foreground">
                {metricName}: <span className="font-semibold">{value.toFixed(1).replace('.', ',')}</span>
              </p>
              <p className={`text-sm font-medium ${colorClass}`}>
                {status}: {sinal}{variacao.toFixed(1).replace('.', ',')}%
              </p>
            </div>
          );
        }
      }
    }
    return null;
  };


  if (isLoading) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Processando Dados</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Gerando análise de evolução das avaliações...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || (!data.generalData?.length && !Object.keys(data.subjectData || {}).length)) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Dados Insuficientes</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Não há dados suficientes para gerar a análise de evolução.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Sem Dados</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Não há dados disponíveis para o período selecionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="general" className="w-full">
      {!onlyOverviewTab && (
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="subjects" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Por Disciplina
          </TabsTrigger>
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Por Níveis
          </TabsTrigger>
        </TabsList>
      )}

      {/* VISÃO GERAL */}
      <TabsContent value="general" className="space-y-6">
        {/* Header com controles */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Activity className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Análise de Evolução - Geral</h3>
              <p className="text-sm text-muted-foreground">
                Comparação entre avaliações selecionadas
              </p>
            </div>
          </div>
          {/* Controles globais removidos: visibilidade agora é por gráfico */}
        </div>

        {data.evaluations?.length > 0 && (
          <EvolutionEvaluationsScopeList
            evaluations={data.evaluations}
            instrumentLabel={instrumentLabel}
            variant="screen"
          />
        )}

        {/* Resumo Estatístico */}
        {generalStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Média Geral</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">
                  {generalStats.media.toFixed(1).replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">pontos</p>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {generalStats.tendencia === 'up' ? (
                    <ArrowUpRight className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : generalStats.tendencia === 'down' ? (
                    <ArrowDownRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-muted-foreground">Variação</span>
                </div>
                <p className={`text-2xl font-semibold ${
                  generalStats.variacaoTotal > 0 ? 'text-green-600 dark:text-green-400' : 
                  generalStats.variacaoTotal < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                }`}>
                  {generalStats.variacaoTotal > 0 ? '+' : ''}{generalStats.variacaoTotal.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">período</p>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Total de Avaliações</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">{generalStats.totalAvaliacoes}</p>
                <p className="text-xs text-muted-foreground mt-1">avaliações</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gráficos Detalhados */}
        <div className="grid grid-cols-1 gap-6">
          {!!data.generalData?.length && (
            <Card className="border border-border">
              <CardHeader className="bg-muted border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    Nota Geral
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleChartCollapse('general-nota')}
                    className="h-8 w-8 p-0"
                    aria-label={isChartCollapsed('general-nota') ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                  >
                    {isChartCollapsed('general-nota') ? (
                      <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                    ) : (
                      <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isChartCollapsed('general-nota') ? 'max-h-0' : 'max-h-[500px]'
              }`}>
                <CardContent className="p-6">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={segmentedGeneral} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend content={createLegendRenderer('general-nota', data.evaluationNames)} />
                      <Bar 
                        dataKey="nota" 
                        name="Nota Média"
                        legendType="none"
                        barSize={60} 
                        radius={[4, 4, 0, 0]}
                        maxBarSize={80}
                        label={{ 
                          position: 'center', 
                          fontSize: 12, 
                          fill: '#1f2937',
                          fontWeight: 'bold',
                          formatter: (value: number) => value.toFixed(1).replace('.', ',')
                        }}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color as string} />
                        ))}
                      </Bar>
                      {/* Linhas por segmento */}
                      <Line
                        type="linear"
                        dataKey="up"
                        name="Crescimento"
                        stroke="#10B981"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'up')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="down"
                        name="Queda"
                        stroke="#EF4444"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'down')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="flat"
                        name="Permaneceu"
                        stroke="#6B7280"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedGeneral, 'nota', 'flat')} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
              </div>
            </Card>
          )}

          {!!data.proficiencyData?.length && (
            <Card className="border border-border">
              <CardHeader className="bg-muted border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    Proficiência Geral
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleChartCollapse('general-prof')}
                    className="h-8 w-8 p-0"
                    aria-label={isChartCollapsed('general-prof') ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                  >
                    {isChartCollapsed('general-prof') ? (
                      <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                    ) : (
                      <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isChartCollapsed('general-prof') ? 'max-h-0' : 'max-h-[500px]'
              }`}>
                <CardContent className="p-6">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={segmentedProficiency} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                      <YAxis 
                        domain={[0, 425]} 
                        tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} 
                        tickFormatter={(value) => value.toFixed(0)}
                        label={{ value: 'Proficiência', angle: -90, position: 'insideLeft', fill: 'hsl(var(--foreground))' }}
                      />
                      <Tooltip content={<CustomProficiencyTooltip />} />
                      <Legend content={createLegendRenderer('general-prof', data.evaluationNames)} />
                      <Bar
                        dataKey="proficiencia"
                        name="Proficiência"
                        legendType="none"
                        barSize={60} 
                        radius={[4, 4, 0, 0]}
                        maxBarSize={80}
                        label={{ 
                          position: 'center', 
                          fontSize: 12, 
                          fill: '#1f2937',
                          fontWeight: 'bold',
                          formatter: (value: number) => value.toFixed(1).replace('.', ',')
                        }}
                      >
                        {proficiencyChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color as string} />
                        ))}
                      </Bar>
                      {/* Linhas por segmento - mais espessas e com cores mais fortes */}
                      <Line
                        type="linear"
                        dataKey="up"
                        name="Crescimento"
                        stroke="#059669"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'up')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="down"
                        name="Queda"
                        stroke="#DC2626"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'down')} />
                      </Line>
                      <Line
                        type="linear"
                        dataKey="flat"
                        name="Permaneceu"
                        stroke="#1f2937"
                        strokeWidth={4}
                        dot={false}
                        isAnimationActive={false}
                      >
                        <LabelList content={makeDeltaLabelRenderer(segmentedProficiency, 'proficiencia', 'flat')} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
              </div>
            </Card>
          )}
        </div>
      </TabsContent>

      {!onlyOverviewTab && (
        <>
      {/* POR DISCIPLINA */}
      <TabsContent value="subjects" className="space-y-6">
        {/* Header para disciplinas */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <BookOpen className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Análise por Disciplina</h3>
              <p className="text-sm text-muted-foreground">
                Comparação detalhada por disciplina
              </p>
            </div>
          </div>

        {Object.keys(data.subjectData || {}).length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma Disciplina Encontrada</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">Não há dados de disciplinas para exibir os gráficos.</p>
            </CardContent>
          </Card>
        ) : Object.entries(data.subjectData).filter(([subject, rows]) => {
          const merged = mergeByName(rows);
          if (merged.length === 0) return false;

          const r = merged[0];
          const rTyped = r as EvolutionDataWithDynamicKeys;
          // A disciplina é considerada válida se tiver dados em TODAS as avaliações selecionadas,
          // qualquer que seja a quantidade (2, 3, 4, ...).
          const hasAllEvaluations = data.evaluationNames.every((_, index) => {
            const etapaKey = `etapa${index + 1}`;
            return safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined) !== undefined;
          });

          return hasAllEvaluations;
        }).length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma Disciplina com Dados Completos</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Não há disciplinas com dados em todas as avaliações selecionadas. 
                Apenas disciplinas com dados completos são exibidas para comparação.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(data.subjectData)
              .filter(([subject, rows]) => {
                // Verificar se a disciplina tem dados em todas as avaliações
                const merged = mergeByName(rows);
                if (merged.length === 0) return false;
                
                const r = merged[0];
                const rTyped = r as EvolutionDataWithDynamicKeys;
                // Verificar se a disciplina tem dados em todas as avaliações dinamicamente
                const hasAllEvaluations = data.evaluationNames.every((evalName, index) => {
                  const etapaKey = `etapa${index + 1}`;
                  return safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined) !== undefined;
                });
                
                return hasAllEvaluations;
              })
              .map(([subject, rows], subjectIndex) => {
              // Construir dados específicos para esta disciplina
              const merged = mergeByName(rows);
              if (merged.length === 0) return null;
              
              const r = merged[0];
              const rTyped = r as EvolutionDataWithDynamicKeys;
              const subjectChartData: Record<string, unknown>[] = [];
              const subjectColors = getSubjectColors(subject, subjectIndex);
              const hiddenSubjectNota = getHidden(`subject-${subject}-nota`);
              
              // Dados de notas dinamicamente para todas as avaliações
              data.evaluationNames.forEach((evalName, index) => {
                if (hiddenSubjectNota.has(evalName)) return;
                
                const etapaKey = `etapa${index + 1}`;
                const etapaValue = safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined);
                
                if (etapaValue !== undefined) {
                  subjectChartData.push({
                    name: evalName,
                    nota: etapaValue,
                    color: subjectColors.palette[index % subjectColors.palette.length],
                  });
                }
              });

              // Gerar dados segmentados para notas
              const subjectSegmented = segmentLine(subjectChartData as Record<string, unknown>[], 'nota');

              // Dados de proficiência para esta disciplina
              const subjectProficiencyData = data.subjectProficiencyData[subject] || [];
              const mergedProficiency = mergeByName(subjectProficiencyData);
              const proficiencyChartData: Record<string, unknown>[] = [];
              const hiddenSubjectProf = getHidden(`subject-${subject}-prof`);
              
              // Verificar se há dados de proficiência em todas as avaliações dinamicamente
              const profTyped = mergedProficiency.length > 0 ? mergedProficiency[0] as EvolutionDataWithDynamicKeys : null;
              const hasAllProficiencyEvaluations = mergedProficiency.length > 0 && profTyped &&
                data.evaluationNames.every((evalName, index) => {
                  const etapaKey = `etapa${index + 1}`;
                  return safe(typeof profTyped[etapaKey] === 'number' ? profTyped[etapaKey] : undefined) !== undefined;
                });
              
              if (mergedProficiency.length > 0 && hasAllProficiencyEvaluations && profTyped) {
                // Dados de proficiência dinamicamente para todas as avaliações
                data.evaluationNames.forEach((evalName, index) => {
                  if (hiddenSubjectProf.has(evalName)) return;
                  
                  const etapaKey = `etapa${index + 1}`;
                  const etapaValue = safe(typeof profTyped[etapaKey] === 'number' ? profTyped[etapaKey] : undefined);
                  
                  if (etapaValue !== undefined) {
                    proficiencyChartData.push({
                      name: evalName,
                      proficiencia: etapaValue,
                      color: subjectColors.palette[index % subjectColors.palette.length],
                    });
                  }
                });
              }

              // Gerar dados segmentados para proficiência
              const subjectProfSegmented = segmentLine(proficiencyChartData as Record<string, unknown>[], 'proficiencia');

              return (
                <div key={subject} className="space-y-4">
                  <h4 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    {subject}
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {/* Gráfico de Notas */}
                <Card className="border border-border">
                  <CardHeader className="bg-muted border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-foreground">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        Notas - {subject}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleChartCollapse(`subject-${subject}-nota`)}
                        className="h-8 w-8 p-0"
                        aria-label={isChartCollapsed(`subject-${subject}-nota`) ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                      >
                        {isChartCollapsed(`subject-${subject}-nota`) ? (
                          <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                        ) : (
                          <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isChartCollapsed(`subject-${subject}-nota`) ? 'max-h-0' : 'max-h-[500px]'
                  }`}>
                    <CardContent className="p-6">
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={subjectSegmented} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                              <Tooltip content={<CustomSubjectTooltip />} />
                              <Legend content={createLegendRenderer(`subject-${subject}-nota`, data.evaluationNames)} />
                          <Bar 
                            dataKey="nota" 
                                name="Nota Média"
                            legendType="none"
                            barSize={60} 
                                radius={[4, 4, 0, 0]}
                            maxBarSize={80}
                            label={{ 
                              position: 'center', 
                              fontSize: 12, 
                              fill: '#ffffff',
                              fontWeight: 'bold',
                              formatter: (value: number) => value.toFixed(1).replace('.', ',')
                            }}
                              >
                                {subjectChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color as string} />
                                ))}
                              </Bar>
                              {/* Linhas por segmento + % acima da linha */}
                              <Line
                                type="linear"
                                dataKey="up"
                                name="Crescimento"
                                stroke="#10B981"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'up')} />
                              </Line>
                              <Line
                                type="linear"
                                dataKey="down"
                                name="Queda"
                                stroke="#EF4444"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'down')} />
                              </Line>
                              <Line
                                type="linear"
                                dataKey="flat"
                                name="Permaneceu"
                                stroke="#6B7280"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectSegmented, 'nota', 'flat')} />
                              </Line>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </div>
                    </Card>

                    {/* Gráfico de Proficiência - apenas se houver dados completos */}
                    {hasAllProficiencyEvaluations && proficiencyChartData.length > 0 && (
                      <Card className="border border-border">
                        <CardHeader className="bg-muted border-b border-border">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                              <Target className="h-5 w-5 text-muted-foreground" />
                              Proficiência - {subject}
                            </CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleChartCollapse(`subject-${subject}-prof`)}
                              className="h-8 w-8 p-0"
                              aria-label={isChartCollapsed(`subject-${subject}-prof`) ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                            >
                              {isChartCollapsed(`subject-${subject}-prof`) ? (
                                <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                              ) : (
                                <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isChartCollapsed(`subject-${subject}-prof`) ? 'max-h-0' : 'max-h-[500px]'
                        }`}>
                          <CardContent className="p-6">
                          <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={subjectProfSegmented} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                              <YAxis 
                                domain={getProficiencyDomain(subject)} 
                                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} 
                                tickFormatter={(value) => value.toFixed(0)}
                                label={{ value: 'Proficiência', angle: -90, position: 'insideLeft', fill: 'hsl(var(--foreground))' }}
                              />
                              <Tooltip content={<CustomSubjectTooltip />} />
                              <Legend content={createLegendRenderer(`subject-${subject}-prof`, data.evaluationNames)} />
                              <Bar
                                dataKey="proficiencia"
                                name="Proficiência"
                                legendType="none"
                                barSize={60}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={80}
                                label={{ 
                                  position: 'center', 
                                  fontSize: 12, 
                                  fill: '#ffffff',
                                  fontWeight: 'bold',
                                  formatter: (value: number) => value.toFixed(1).replace('.', ',')
                                }}
                              >
                                {proficiencyChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color as string} />
                                ))}
                              </Bar>
                              {/* Linhas por segmento + % acima da linha */}
                              <Line
                                type="linear"
                                dataKey="up"
                                name="Crescimento"
                                stroke="#10B981"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'up')} />
                              </Line>
                              <Line
                                type="linear"
                                dataKey="down"
                                name="Queda"
                                stroke="#EF4444"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'down')} />
                              </Line>
                              <Line
                                type="linear"
                                dataKey="flat"
                                name="Permaneceu"
                                stroke="#6B7280"
                                strokeWidth={4}
                                dot={false}
                                isAnimationActive={false}
                              >
                                <LabelList content={makeDeltaLabelRenderer(subjectProfSegmented, 'proficiencia', 'flat')} />
                              </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </div>
                </Card>
                    )}
              </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* POR NÍVEIS */}
      <TabsContent value="levels" className="space-y-6">
        {/* Header para níveis */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Users className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Análise por Níveis de Proficiência</h3>
            <p className="text-sm text-muted-foreground">
              Quantidade de alunos por nível em cada avaliação
            </p>
          </div>
        </div>

        {Object.keys(data.levelsData || {}).length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum Dado de Nível Encontrado</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Não há dados de níveis de proficiência para exibir os gráficos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(data.levelsData)
              .filter(([levelName, rows]) => {
                const merged = mergeByName(rows);
                if (merged.length === 0) return false;
                
                const r = merged[0];
                const rTyped = r as EvolutionDataWithDynamicKeys;
                // Verificar se o nível tem dados em todas as avaliações dinamicamente
                const hasAllEvaluations = data.evaluationNames.every((evalName, index) => {
                  const etapaKey = `etapa${index + 1}`;
                  return safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined) !== undefined;
                });
                
                return hasAllEvaluations;
              })
              .map(([levelName, rows]) => {
                // Construir dados específicos para este nível
                const merged = mergeByName(rows);
                if (merged.length === 0) return null;
                
                const r = merged[0];
                const rTyped = r as EvolutionDataWithDynamicKeys;
                const levelChartData: Record<string, unknown>[] = [];
                const hiddenLevel = getHidden(`level-${levelName}`);
                
                // Cores por nível
                const levelColors: Record<string, string> = {
                  'Abaixo do Básico': '#DC2626',
                  'Básico': '#F59E0B',
                  'Adequado': '#4ade80',
                  'Avançado': '#16A34A',
                };
                
                const levelColor = levelColors[levelName] || '#6B7280';
                
                // Dados dinamicamente para todas as avaliações
                data.evaluationNames.forEach((evalName, index) => {
                  if (hiddenLevel.has(evalName)) return;
                  
                  const etapaKey = `etapa${index + 1}`;
                  const etapaValue = safe(typeof rTyped[etapaKey] === 'number' ? rTyped[etapaKey] : undefined);
                  
                  if (etapaValue !== undefined) {
                    levelChartData.push({
                      name: evalName,
                      quantidade: etapaValue,
                      color: levelColor,
                    });
                  }
                });

                // Gerar dados segmentados
                const levelSegmented = segmentLine(levelChartData as Record<string, unknown>[], 'quantidade');

                // Tooltip customizado para níveis
                const CustomLevelTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
                  if (active && payload && payload.length) {
                    const barData = payload.find((p: TooltipPayload) => p.dataKey === 'quantidade');
                    if (barData) {
                      const quantidade = barData.value as number;
                      const data = barData.payload;
                      
                      // Calcular variação
                      let variacao = 0;
                      const currentIndex = payload.findIndex(p => p.payload === data);
                      
                      if (currentIndex > 0) {
                        const prevData = payload[currentIndex - 1]?.payload;
                        if (prevData && prevData.quantidade !== undefined) {
                          const prevValue = prevData.quantidade as number;
                          const currentValue = quantidade;
                          variacao = prevValue > 0 ? ((currentValue - prevValue) / prevValue) * 100 : (currentValue > 0 ? 100 : 0);
                        }
                      }
                      
                      const sinal = variacao > 0 ? '+' : '';
                      
                      return (
                        <div className="bg-card p-3 border border-border rounded-lg shadow-sm">
                          <p className="text-sm font-medium text-foreground mb-1">{label}</p>
                          <p className="text-sm text-foreground">
                            Alunos: <span className="font-semibold text-foreground">{quantidade}</span>
                          </p>
                          {variacao !== 0 && (
                            <p className={`text-sm font-medium ${
                              variacao > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              Variação: {sinal}{variacao.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      );
                    }
                  }
                  return null;
                };

                return (
                  <Card key={levelName} className="border border-border">
                    <CardHeader className="bg-muted border-b border-border">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: levelColor }}
                          />
                          {levelName}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleChartCollapse(`level-${levelName}`)}
                          className="h-8 w-8 p-0"
                          aria-label={isChartCollapsed(`level-${levelName}`) ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                        >
                          {isChartCollapsed(`level-${levelName}`) ? (
                            <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                          ) : (
                            <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isChartCollapsed(`level-${levelName}`) ? 'max-h-0' : 'max-h-[500px]'
                    }`}>
                      <CardContent className="p-6">
                      <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={levelSegmented} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                            <YAxis 
                              domain={[0, 'dataMax + 5']} 
                              tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} 
                              allowDecimals={false}
                              label={{ value: 'Quantidade de Alunos', angle: -90, position: 'insideLeft', fill: 'hsl(var(--foreground))' }}
                            />
                            <Tooltip content={<CustomLevelTooltip />} />
                            <Legend content={createLegendRenderer(`level-${levelName}`, data.evaluationNames)} />
                            <Bar
                              dataKey="quantidade"
                              name="Quantidade de Alunos"
                              legendType="none"
                              barSize={60}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={80}
                              label={{ 
                                position: 'center', 
                                fontSize: 12, 
                                fill: '#ffffff',
                                fontWeight: 'bold',
                                formatter: (value: number) => value.toFixed(0)
                              }}
                            >
                              {levelChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color as string} />
                              ))}
                            </Bar>
                            {/* Linhas por segmento */}
                            <Line
                              type="linear"
                              dataKey="up"
                              name="Crescimento"
                              stroke="#10B981"
                              strokeWidth={4}
                              dot={false}
                              isAnimationActive={false}
                            >
                              <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'up')} />
                            </Line>
                            <Line
                              type="linear"
                              dataKey="down"
                              name="Queda"
                              stroke="#EF4444"
                              strokeWidth={4}
                              dot={false}
                              isAnimationActive={false}
                            >
                              <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'down')} />
                            </Line>
                            <Line
                              type="linear"
                              dataKey="flat"
                              name="Permaneceu"
                              stroke="#6B7280"
                              strokeWidth={4}
                              dot={false}
                              isAnimationActive={false}
                            >
                              <LabelList content={makeDeltaLabelRenderer(levelSegmented, 'quantidade', 'flat')} />
                            </Line>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </TabsContent>
        </>
      )}
    </Tabs>
  );
}