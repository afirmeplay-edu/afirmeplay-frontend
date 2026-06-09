import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  RefreshCw,
  Thermometer,
  FileDown,
  Sparkles,
  Target,
  ListChecks,
  Lightbulb,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  fetchAnswerSheetFilterOptions,
  fetchEvaluationFilterOptions,
  fetchSkillsMapCartao,
  fetchSkillsMapCartaoAnaliseIa,
  fetchSkillsMapCartaoErros,
  fetchSkillsMapOnline,
  fetchSkillsMapOnlineAnaliseIa,
  fetchSkillsMapOnlineErros,
  type SkillsMapErrosResponse,
  type SkillsMapHabilidade,
  type SkillsMapResponse,
} from '@/services/evaluation/skillsMapApi';
import type { AnaliseIaRouteResponse } from '@/services/evaluation/evaluationResultsApi';
import { ResultsPeriodMonthYearPicker, EvaluationInstrumentPicker } from '@/components/filters';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { normalizeResultsPeriodYm } from '@/utils/resultsPeriod';
import { getClassShiftLabel } from '@/lib/classShift';
import {
  downloadSkillsHeatMapGeneralPdf,
  downloadSkillsHeatMapSkillPdf,
  type SkillsHeatMapPdfMeta,
} from '@/utils/report/skillsHeatMapPdf';

const FAIXA_ORDER = [
  'abaixo_do_basico',
  'basico',
  'adequado',
  'avancado',
] as const;

const FAIXA_LABELS: Record<(typeof FAIXA_ORDER)[number], string> = {
  abaixo_do_basico: '0–29% Abaixo do Básico',
  basico: '30–59% Básico',
  adequado: '60–79% Adequado',
  avancado: '80–100% Avançado',
};

const CARD_BG: Record<(typeof FAIXA_ORDER)[number], string> = {
  abaixo_do_basico: 'bg-gradient-to-br from-red-600/90 to-orange-500/90 text-white',
  basico: 'bg-gradient-to-br from-amber-400 to-yellow-300 text-amber-950',
  adequado: 'bg-gradient-to-br from-lime-400 to-emerald-300 text-emerald-950',
  avancado: 'bg-gradient-to-br from-emerald-700 to-green-600 text-white',
};

function normEntities(items: unknown): Array<{ id: string; nome: string; shift?: string }> {
  if (!Array.isArray(items)) return [];
  return items.map(
    (item: {
      id?: string;
      nome?: string;
      name?: string;
      titulo?: string;
      title?: string;
      shift?: string;
    }) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? item.titulo ?? item.title ?? '',
      shift: item.shift?.trim() || undefined,
    })
  );
}

function _looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

/** Título no cartão/modal: nunca mostrar UUID como código. */
function skillDisplayTitle(h: SkillsMapHabilidade): string {
  const c = (h.codigo || '').trim();
  if (c && !_looksLikeUuid(c)) return c;
  const d = (h.descricao || '').trim();
  if (d && !_looksLikeUuid(d)) return d.length > 72 ? `${d.slice(0, 69)}…` : d;
  return 'Habilidade';
}

function skillDisciplinaLabel(h: SkillsMapHabilidade): string | null {
  const n = (h.disciplina_nome || '').trim();
  if (n) return n;
  return null;
}

function filterEvaluationsForDropdown(
  avaliacoes: Array<{ id?: string; titulo?: string; title?: string; type?: string; tipo?: string }>
) {
  return (avaliacoes || [])
    .filter((evaluation) => {
      const raw = (evaluation.type ?? evaluation.tipo ?? '').toString().trim();
      const type = raw.toUpperCase();
      const title = String(evaluation.titulo ?? evaluation.title ?? '').toUpperCase();
      if (type === 'OLIMPIADAS' || type === 'OLIMPIADA' || type.includes('OLIMPI')) return false;
      if (type === 'COMPETICAO' || type === 'COMPETIÇÃO' || type.includes('COMPET')) return false;
      if (title.includes('OLIMPI') || title.includes('OLÍMPIC')) return false;
      return type === '' || type === 'AVALIACAO' || type === 'SIMULADO';
    })
    .map((e) => ({
      id: String(e.id ?? ''),
      nome: e.titulo ?? e.title ?? 'Sem título',
    }));
}

function SkillCard({
  h,
  onClick,
}: {
  h: SkillsMapHabilidade;
  onClick: () => void;
}) {
  const disciplina = skillDisciplinaLabel(h);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg p-2.5 text-left shadow-sm transition hover:opacity-95 hover:ring-2 hover:ring-primary/40',
        CARD_BG[h.faixa] || CARD_BG.basico
      )}
    >
      <div className="font-semibold text-xs leading-tight">{skillDisplayTitle(h)}</div>
      {disciplina && (
        <div className="mt-1 text-[10px] font-medium opacity-90 line-clamp-1 leading-snug">
          {disciplina}
        </div>
      )}
      <div className="mt-1.5 text-2xl font-bold leading-none">{h.percentual_acertos.toFixed(1)}%</div>
      <div className="mt-1 text-[11px] opacity-90">Acertaram</div>
    </button>
  );
}

const FAIXA_DOT: Record<(typeof FAIXA_ORDER)[number], string> = {
  abaixo_do_basico: 'bg-red-600',
  basico: 'bg-amber-400',
  adequado: 'bg-lime-500',
  avancado: 'bg-emerald-700',
};

function HeatMapLegendInside() {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-medium text-foreground">Guia de percentual de acertos</p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Valor em cada cartão: fração de alunos com cartão corrigido que acertaram itens da habilidade (faltosos e folhas sem leitura não entram no cálculo).
      </p>
      <div>
        <div className="flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground mb-1 px-0.5">
          <span>0%</span>
          <span>30%</span>
          <span>60%</span>
          <span>80%</span>
          <span>100%</span>
        </div>
        <div
          className="h-9 w-full rounded-md bg-gradient-to-r from-red-600 via-amber-400 via-lime-400 to-emerald-700 shadow-inner ring-1 ring-black/5 dark:ring-white/10"
          role="img"
          aria-label="Escala contínua de zero a cem por cento de acertos"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FAIXA_ORDER.map((faixa) => (
          <div
            key={faixa}
            className="flex gap-2 rounded-md border border-border/80 bg-background/90 px-2 py-1.5 text-left"
          >
            <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-sm', FAIXA_DOT[faixa])} aria-hidden />
            <span className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight">{FAIXA_LABELS[faixa]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapSummaryCards({
  avaliacaoLabel,
  alunosEscopo,
  alunosParticipantes,
}: {
  avaliacaoLabel: string;
  alunosEscopo: number | string;
  alunosParticipantes: number | string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Avaliação
        </p>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-foreground">
          {avaliacaoLabel || '—'}
        </p>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Quantidade de alunos
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
          {alunosEscopo ?? '—'}
        </p>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Alunos que participaram
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
          {alunosParticipantes ?? '—'}
        </p>
      </div>
    </div>
  );
}

function HeatColumns({
  porFaixa,
  onSkillClick,
  gridClassName,
}: {
  porFaixa: SkillsMapResponse['por_faixa'];
  onSkillClick: (h: SkillsMapHabilidade) => void;
  gridClassName?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-4', gridClassName ?? 'mt-6')}>
      {FAIXA_ORDER.map((faixa) => {
        const list = porFaixa?.[faixa] ?? [];
        return (
          <div key={faixa} className="flex flex-col rounded-lg border bg-muted/30 p-3 min-h-[200px]">
            <h3 className="mb-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {FAIXA_LABELS[faixa]}
            </h3>
            {list.length === 0 ? (
              <p className="mt-4 text-center text-sm text-muted-foreground">Nenhuma habilidade</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {list.map((h, idx) => (
                  <SkillCard
                    key={`${h.skill_id}-${h.subject_id ?? 's'}-${h.question_ref ?? h.questao_numero ?? idx}`}
                    h={h}
                    onClick={() => onSkillClick(h)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalysisLoadingCard() {
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          Análise do mapa de habilidades
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background/70 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Processando análise dos resultados...
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-primary/70" />
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Consolidando resultados por faixa
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              Organizando habilidades prioritárias
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Estruturando recomendações para intervenção
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-3 w-11/12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-10/12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-8/12 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

function toSectionLabel(key: string): string {
  const map: Record<string, string> = {
    document_title: 'Título',
    warning: 'Aviso',
    error: 'Mensagem',
    details: 'Detalhes',
    item_1: '1. Foco analítico',
    item_2: '2. Matriz de ação por habilidade',
    item_3: '3. Dinâmica de sala e recomposição',
  };
  if (map[key]) return map[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSkillText(raw: string): string {
  return normalizeLabel(raw)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTrimMessage(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isSkillAnalysisObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).map((k) => normalizeLabel(k));
  const hasSkill = keys.some((k) => k.includes('habilidade'));
  const hasActionField = keys.some(
    (k) =>
      k.includes('conteudo') ||
      k.includes('estruturante') ||
      k.includes('dificuldade') ||
      k.includes('como trabalhar') ||
      k.includes('passo a passo') ||
      k.includes('atividade')
  );
  return hasSkill || hasActionField;
}

function faixaTagClass(v: string): string {
  const n = normalizeLabel(v);
  if (n.includes('abaixo')) return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
  if (n.includes('basico')) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
  if (n.includes('adequado')) return 'bg-lime-500/10 text-lime-700 dark:text-lime-300 border-lime-500/30';
  if (n.includes('avancado')) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  return 'bg-primary/10 text-primary border-primary/30';
}

function renderSkillAnalysisCard(skillObj: Record<string, unknown>, keyPrefix: string): JSX.Element {
  const entries = Object.entries(skillObj);
  const skillEntry = entries.find(([k]) => normalizeLabel(k).includes('habilidade'));
  const levelEntry = entries.find(
    ([k]) => normalizeLabel(k).includes('nivel') || normalizeLabel(k).includes('faixa')
  );
  const title = String(skillEntry?.[1] ?? 'Habilidade').trim() || 'Habilidade';
  const level = String(levelEntry?.[1] ?? '').trim();
  const detailEntries = entries.filter(([k]) => {
    const nk = normalizeLabel(k);
    return !nk.includes('habilidade') && !nk.includes('nivel') && !nk.includes('faixa');
  });

  return (
    <article
      key={keyPrefix}
      className="rounded-xl border border-primary/20 bg-background/90 p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground leading-relaxed">{title}</h4>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Habilidade
          </span>
          {level ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                faixaTagClass(level)
              )}
            >
              Nível: {level}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        {detailEntries.map(([k, v], index) => (
          <div key={`${keyPrefix}-${k}-${index}`} className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {toSectionLabel(k)}
            </p>
            <div className="text-sm leading-relaxed text-foreground">
              {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                ? String(v)
                : renderAnalysisContent(v, `${keyPrefix}-${k}-${index}`)}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function getSkillAnalysisTitle(skillObj: Record<string, unknown>): string {
  const entries = Object.entries(skillObj);
  const skillEntry = entries.find(([k]) => normalizeLabel(k).includes('habilidade'));
  const title = String(skillEntry?.[1] ?? '').trim();
  return title || 'Habilidade';
}

function extractSkillCode(title: string): string | null {
  const head = String(title || '').split('-')[0]?.trim();
  if (!head) return null;
  if (/^[A-Z0-9]{4,}$/i.test(head.replace(/\s+/g, ''))) return head;
  return null;
}

function renderSkillAnalysisDetail(
  skillObj: Record<string, unknown>,
  keyPrefix: string,
  mapSkill?: SkillsMapHabilidade | null
): JSX.Element {
  const entries = Object.entries(skillObj);
  const levelEntry = entries.find(
    ([k]) => normalizeLabel(k).includes('nivel') || normalizeLabel(k).includes('faixa')
  );
  const level = String(levelEntry?.[1] ?? '').trim() || (mapSkill?.faixa ? FAIXA_LABELS[mapSkill.faixa] : '');
  const title = getSkillAnalysisTitle(skillObj);
  const codeFromTitle = extractSkillCode(title);
  const code = (mapSkill?.codigo || '').trim() || codeFromTitle || null;
  const detailEntries = entries.filter(([k]) => {
    const nk = normalizeLabel(k);
    return !nk.includes('habilidade') && !nk.includes('nivel') && !nk.includes('faixa');
  });

  return (
    <div className="rounded-xl border border-primary/20 bg-background/90 p-4 shadow-sm space-y-3">
      <h4 className="text-sm font-semibold leading-relaxed text-foreground">{title}</h4>
      <div className="flex flex-wrap items-center gap-2">
        {code ? (
          <span className="inline-flex items-center rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {code}
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Habilidade selecionada
        </span>
        {level ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
              faixaTagClass(level)
            )}
          >
            Nível: {level}
          </span>
        ) : null}
      </div>
      <div className="grid gap-2">
        {detailEntries.map(([k, v], index) => (
          <div key={`${keyPrefix}-detail-${k}-${index}`} className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {toSectionLabel(k)}
            </p>
            <div className="text-sm leading-relaxed text-foreground">
              {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                ? String(v)
                : renderAnalysisContent(v, `${keyPrefix}-detail-${k}-${index}`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAnalysisContent(
  value: unknown,
  keyPrefix = 'analysis',
  shouldShowSkill?: (skillObj: Record<string, unknown>) => boolean
): JSX.Element {
  if (value == null) {
    return <p className="text-sm text-muted-foreground">Sem dados de análise disponíveis para este recorte.</p>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return <p className="text-sm text-muted-foreground">Sem dados de análise disponíveis para este recorte.</p>;
    }
    const allPrimitive = value.every(
      (item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    );
    if (allPrimitive) {
      return (
        <ul className="list-disc space-y-1 pl-4">
          {value.map((item, index) => (
            <li key={`${keyPrefix}-${index}`} className="text-sm leading-relaxed text-foreground">
              {String(item)}
            </li>
          ))}
        </ul>
      );
    }
    const allSkills = value.every((item) => isSkillAnalysisObject(item));
    if (allSkills) {
      const filteredSkills = shouldShowSkill
        ? (value as Record<string, unknown>[]).filter((item) => shouldShowSkill(item))
        : (value as Record<string, unknown>[]);
      if (!filteredSkills.length) {
        return (
          <p className="text-sm text-muted-foreground">
            Não há habilidades abaixo de 60% para exibir nesta análise.
          </p>
        );
      }
      return (
        <div className="space-y-3">
          {filteredSkills.map((item, index) => (
            <div key={`${keyPrefix}-skill-${index}`}>
              {renderSkillAnalysisCard(item as Record<string, unknown>, `${keyPrefix}-skill-${index}`)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={`${keyPrefix}-${index}`} className="rounded-md border bg-background/70 p-3">
            {renderAnalysisContent(item, `${keyPrefix}-${index}`, shouldShowSkill)}
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">Sem dados de análise disponíveis para este recorte.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, item]) => (
        <details key={`${keyPrefix}-${key}`} className="group rounded-lg border bg-background/70 p-3" open>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {toSectionLabel(key)}
              </p>
              <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-180">
                ▼
              </span>
            </div>
          </summary>
          <div className="mt-2">{renderAnalysisContent(item, `${keyPrefix}-${key}`, shouldShowSkill)}</div>
        </details>
      ))}
    </div>
  );
}

function AnalysisCard({
  analysis,
  habilidadesMapa,
}: {
  analysis: unknown;
  habilidadesMapa?: SkillsMapHabilidade[];
}) {
  const topLevelEntries =
    analysis && typeof analysis === 'object' && !Array.isArray(analysis)
      ? Object.entries(analysis as Record<string, unknown>)
      : [];
  const hasWarning = topLevelEntries.some(([k]) => k === 'warning' || k === 'error');
  const sectionsCount = topLevelEntries.filter(([k]) => !['document_title', 'warning', 'error'].includes(k)).length;

  const lowSkills = useMemo(
    () => (habilidadesMapa || []).filter((h) => Number(h.percentual_acertos || 0) < 60),
    [habilidadesMapa]
  );

  const skillTokens = useMemo(() => {
    const s = new Set<string>();
    lowSkills.forEach((h) => {
      const code = normalizeSkillText(h.codigo || '');
      const desc = normalizeSkillText(h.descricao || '');
      const title = normalizeSkillText(skillDisplayTitle(h));
      if (code) s.add(code);
      if (desc) s.add(desc);
      if (title) s.add(title);
      if (code && desc) s.add(normalizeSkillText(`${code} ${desc}`));
    });
    return s;
  }, [lowSkills]);

  const shouldShowSkill = useCallback(
    (skillObj: Record<string, unknown>) => {
      if (!skillTokens.size) return false;
      const entries = Object.entries(skillObj);
      const skillEntry = entries.find(([k]) => normalizeLabel(k).includes('habilidade'));
      const label = normalizeSkillText(String(skillEntry?.[1] ?? ''));
      if (!label) return false;
      for (const token of skillTokens) {
        if (token && (label.includes(token) || token.includes(label))) {
          return true;
        }
      }
      return false;
    },
    [skillTokens]
  );

  const resolveMapSkillForAnalysis = useCallback(
    (skillObj: Record<string, unknown>): SkillsMapHabilidade | null => {
      const label = normalizeSkillText(getSkillAnalysisTitle(skillObj));
      if (!label) return null;
      for (const h of lowSkills) {
        const candidates = [
          normalizeSkillText(h.codigo || ''),
          normalizeSkillText(h.descricao || ''),
          normalizeSkillText(skillDisplayTitle(h)),
          normalizeSkillText(`${h.codigo || ''} ${h.descricao || ''}`),
        ].filter(Boolean);
        if (candidates.some((c) => label.includes(c) || c.includes(label))) {
          return h;
        }
      }
      return null;
    },
    [lowSkills]
  );

  const analysisObject =
    analysis && typeof analysis === 'object' && !Array.isArray(analysis)
      ? (analysis as Record<string, unknown>)
      : null;
  const skillCandidatesRaw = Array.isArray(analysisObject?.item_2) ? analysisObject?.item_2 : [];
  const skillCards = (skillCandidatesRaw as unknown[])
    .filter((x): x is Record<string, unknown> => isSkillAnalysisObject(x))
    .filter((x) => shouldShowSkill(x));
  const [selectedSkillIdx, setSelectedSkillIdx] = useState(0);
  const selectedSkill = skillCards[selectedSkillIdx] ?? null;

  const generalEntries = topLevelEntries.filter(([k]) => !['item_2'].includes(k));
  const generalAnalysis: Record<string, unknown> = Object.fromEntries(generalEntries);

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Análise do mapa de habilidades
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-primary" />
            Priorização por desempenho
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5 text-primary" />
            {sectionsCount || 0} seções
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            Recomendações aplicáveis
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasWarning && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Alguns pontos desta análise podem depender do volume/qualidade dos dados no recorte atual.
          </div>
        )}

        {Object.keys(generalAnalysis).length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Visão geral
            </p>
            {renderAnalysisContent(generalAnalysis, 'analysis-general', shouldShowSkill)}
          </div>
        ) : null}

        {skillCards.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Habilidades priorizadas (&lt; 60%)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {skillCards.map((skillObj, idx) => {
                const title = getSkillAnalysisTitle(skillObj);
                const mapSkill = resolveMapSkillForAnalysis(skillObj);
                const faixa = mapSkill?.faixa ?? 'basico';
                const skillCode = (mapSkill?.codigo || '').trim() || extractSkillCode(title) || '';
                const isSelected = idx === selectedSkillIdx;
                return (
                  <button
                    key={`skill-card-${idx}-${title}`}
                    type="button"
                    onClick={() => setSelectedSkillIdx(idx)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition shadow-sm',
                      CARD_BG[faixa],
                      isSelected
                        ? 'ring-2 ring-primary/60'
                        : 'opacity-95 hover:opacity-100'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug line-clamp-2">{title}</p>
                      <span className="inline-flex items-center rounded-full border border-current/20 bg-black/10 px-2 py-0.5 text-[10px] font-medium">
                        Habilidade
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {skillCode ? (
                        <span className="inline-flex items-center rounded-full border border-current/20 bg-black/10 px-2 py-0.5 text-[10px] font-semibold">
                          {skillCode}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center rounded-full border border-current/20 bg-black/10 px-2 py-0.5 text-[10px] font-medium">
                        {FAIXA_LABELS[faixa]}
                      </span>
                      {mapSkill ? (
                        <span className="inline-flex items-center rounded-full border border-current/20 bg-black/10 px-2 py-0.5 text-[10px] font-medium">
                          {mapSkill.percentual_acertos.toFixed(1)}%
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedSkill ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalhamento específico
                </p>
                {renderSkillAnalysisDetail(
                  selectedSkill,
                  `selected-skill-${selectedSkillIdx}`,
                  resolveMapSkillForAnalysis(selectedSkill)
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não há habilidades abaixo de 60% para exibir nesta análise.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SkillsHeatMapPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'online' | 'cartao'>('online');

  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const periodoYm = useMemo(() => {
    if (selectedPeriod === 'all') return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === 'all' ? undefined : n;
  }, [selectedPeriod]);

  const [oEstado, setOEstado] = useState('all');
  const [oMunicipio, setOMunicipio] = useState('all');
  const [oAvaliacao, setOAvaliacao] = useState('all');
  const [oEscola, setOEscola] = useState('all');
  const [oSerie, setOSerie] = useState('all');
  const [oTurma, setOTurma] = useState('all');
  const [oDisciplina, setODisciplina] = useState('all');

  const [oEstados, setOEstados] = useState<Array<{ id: string; nome: string }>>([]);
  const [oMunicipios, setOMunicipios] = useState<Array<{ id: string; nome: string }>>([]);
  const [oAvaliacoes, setOAvaliacoes] = useState<Array<{ id: string; nome: string }>>([]);
  const [oEscolas, setOEscolas] = useState<Array<{ id: string; nome: string }>>([]);
  const [oSeries, setOSeries] = useState<Array<{ id: string; nome: string }>>([]);
  const [oTurmas, setOTurmas] = useState<Array<{ id: string; nome: string; shift?: string }>>([]);
  const [oDisciplinas, setODisciplinas] = useState<Array<{ id: string; nome: string }>>([]);

  const [cEstado, setCEstado] = useState('all');
  const [cMunicipio, setCMunicipio] = useState('all');
  const [cGabarito, setCGabarito] = useState('all');
  const [cEscola, setCEscola] = useState('all');
  const [cSerie, setCSerie] = useState('all');
  const [cTurma, setCTurma] = useState('all');
  const [cDisciplina, setCDisciplina] = useState('all');

  const [cEstados, setCEstados] = useState<Array<{ id: string; nome: string }>>([]);
  const [cMunicipios, setCMunicipios] = useState<Array<{ id: string; nome: string }>>([]);
  const [cGabaritos, setCGabaritos] = useState<Array<{ id: string; nome: string }>>([]);
  const [cEscolas, setCEscolas] = useState<Array<{ id: string; nome: string }>>([]);
  const [cSeries, setCSeries] = useState<Array<{ id: string; nome: string }>>([]);
  const [cTurmas, setCTurmas] = useState<Array<{ id: string; nome: string; shift?: string }>>([]);
  const [cDisciplinas, setCDisciplinas] = useState<Array<{ id: string; nome: string }>>([]);

  const [mapOnline, setMapOnline] = useState<SkillsMapResponse | null>(null);
  const [mapCartao, setMapCartao] = useState<SkillsMapResponse | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [iaOnlineSlice, setIaOnlineSlice] = useState<AnaliseIaRouteResponse | null>(null);
  const [iaCartaoSlice, setIaCartaoSlice] = useState<AnaliseIaRouteResponse | null>(null);
  /** > 0 só após clicar em “Gerar análise da IA”; não chama analise-ia ao carregar o mapa. */
  const [iaManualOnlineSeq, setIaManualOnlineSeq] = useState(0);
  const [iaManualCartaoSeq, setIaManualCartaoSeq] = useState(0);

  const mapIaOnlineTimeoutRef = useRef<number | null>(null);
  const mapIaCartaoTimeoutRef = useRef<number | null>(null);
  const mapIaOnlineGenRef = useRef(0);
  const mapIaCartaoGenRef = useRef(0);

  const clearMapIaOnlineTimer = useCallback(() => {
    if (mapIaOnlineTimeoutRef.current != null) {
      window.clearTimeout(mapIaOnlineTimeoutRef.current);
      mapIaOnlineTimeoutRef.current = null;
    }
  }, []);

  const clearMapIaCartaoTimer = useCallback(() => {
    if (mapIaCartaoTimeoutRef.current != null) {
      window.clearTimeout(mapIaCartaoTimeoutRef.current);
      mapIaCartaoTimeoutRef.current = null;
    }
  }, []);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSkill, setDialogSkill] = useState<SkillsMapHabilidade | null>(null);
  const [dialogErros, setDialogErros] = useState<SkillsMapErrosResponse | null>(null);
  const [loadingErros, setLoadingErros] = useState(false);
  const [dialogListaTab, setDialogListaTab] = useState<'acertaram' | 'erraram'>('acertaram');

  const periodoLabelText = useMemo(() => {
    if (selectedPeriod === 'all') return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    if (n === 'all') return undefined;
    const [y, mo] = n.split('-');
    return `${mo}/${y}`;
  }, [selectedPeriod]);

  const filtrosPdfOnline = useMemo(() => {
    const lines: string[] = [];
    const e = oEstados.find((x) => x.id === oEstado)?.nome;
    const m = oMunicipios.find((x) => x.id === oMunicipio)?.nome;
    const av = oAvaliacoes.find((x) => x.id === oAvaliacao)?.nome;
    const es = oEscolas.find((x) => x.id === oEscola)?.nome;
    const sr = oSeries.find((x) => x.id === oSerie)?.nome;
    const tu = oTurmas.find((x) => x.id === oTurma)?.nome;
    const di = oDisciplinas.find((x) => x.id === oDisciplina)?.nome;
    if (e && oEstado !== 'all') lines.push(`Estado: ${e}`);
    if (m && oMunicipio !== 'all') lines.push(`Município: ${m}`);
    if (av && oAvaliacao !== 'all') lines.push(`Avaliação: ${av}`);
    if (es && oEscola !== 'all') lines.push(`Escola: ${es}`);
    if (sr && oSerie !== 'all') lines.push(`Série: ${sr}`);
    if (tu && oTurma !== 'all') lines.push(`Turma: ${tu}`);
    if (di && oDisciplina !== 'all') lines.push(`Disciplina: ${di}`);
    return lines;
  }, [
    oEstado,
    oMunicipio,
    oAvaliacao,
    oEscola,
    oSerie,
    oTurma,
    oDisciplina,
    oEstados,
    oMunicipios,
    oAvaliacoes,
    oEscolas,
    oSeries,
    oTurmas,
    oDisciplinas,
  ]);

  const filtrosPdfCartao = useMemo(() => {
    const lines: string[] = [];
    const e = cEstados.find((x) => x.id === cEstado)?.nome;
    const m = cMunicipios.find((x) => x.id === cMunicipio)?.nome;
    const gb = cGabaritos.find((x) => x.id === cGabarito)?.nome;
    const es = cEscolas.find((x) => x.id === cEscola)?.nome;
    const sr = cSeries.find((x) => x.id === cSerie)?.nome;
    const tu = cTurmas.find((x) => x.id === cTurma)?.nome;
    const di = cDisciplinas.find((x) => x.id === cDisciplina)?.nome;
    if (e && cEstado !== 'all') lines.push(`Estado: ${e}`);
    if (m && cMunicipio !== 'all') lines.push(`Município: ${m}`);
    if (gb && cGabarito !== 'all') lines.push(`Gabarito: ${gb}`);
    if (es && cEscola !== 'all') lines.push(`Escola: ${es}`);
    if (sr && cSerie !== 'all') lines.push(`Série: ${sr}`);
    if (tu && cTurma !== 'all') lines.push(`Turma: ${tu}`);
    if (di && cDisciplina !== 'all') lines.push(`Disciplina (bloco): ${di}`);
    return lines;
  }, [
    cEstado,
    cMunicipio,
    cGabarito,
    cEscola,
    cSerie,
    cTurma,
    cDisciplina,
    cEstados,
    cMunicipios,
    cGabaritos,
    cEscolas,
    cSeries,
    cTurmas,
    cDisciplinas,
  ]);

  const filtrosMetaOnline = useMemo<SkillsHeatMapPdfMeta>(() => ({
    estado:    oEstados.find((x) => x.id === oEstado)?.nome,
    municipio: oMunicipios.find((x) => x.id === oMunicipio)?.nome,
    municipioId: oMunicipio !== 'all' ? oMunicipio : undefined,
    avaliacao: oAvaliacoes.find((x) => x.id === oAvaliacao)?.nome,
    escola:    oEscolas.find((x) => x.id === oEscola)?.nome,
    serie:     oSeries.find((x) => x.id === oSerie)?.nome,
    turma:     oTurmas.find((x) => x.id === oTurma)?.nome,
    shift:     oTurmas.find((x) => x.id === oTurma)?.shift,
    disciplina: oDisciplinas.find((x) => x.id === oDisciplina)?.nome,
  }), [
    oEstado, oMunicipio, oAvaliacao, oEscola, oSerie, oTurma, oDisciplina,
    oEstados, oMunicipios, oAvaliacoes, oEscolas, oSeries, oTurmas, oDisciplinas,
  ]);

  const filtrosMetaCartao = useMemo<SkillsHeatMapPdfMeta>(() => ({
    estado:    cEstados.find((x) => x.id === cEstado)?.nome,
    municipio: cMunicipios.find((x) => x.id === cMunicipio)?.nome,
    municipioId: cMunicipio !== 'all' ? cMunicipio : undefined,
    gabarito:  cGabaritos.find((x) => x.id === cGabarito)?.nome,
    escola:    cEscolas.find((x) => x.id === cEscola)?.nome,
    serie:     cSeries.find((x) => x.id === cSerie)?.nome,
    turma:     cTurmas.find((x) => x.id === cTurma)?.nome,
    shift:     cTurmas.find((x) => x.id === cTurma)?.shift,
    disciplina: cDisciplinas.find((x) => x.id === cDisciplina)?.nome,
  }), [
    cEstado, cMunicipio, cGabarito, cEscola, cSerie, cTurma, cDisciplina,
    cEstados, cMunicipios, cGabaritos, cEscolas, cSeries, cTurmas, cDisciplinas,
  ]);

  const periodChangeRef = useRef(false);
  useEffect(() => {
    if (!periodChangeRef.current) {
      periodChangeRef.current = true;
      return;
    }
    setOMunicipio('all');
    setOAvaliacao('all');
    setOEscola('all');
    setOSerie('all');
    setOTurma('all');
    setODisciplina('all');
    setMapOnline(null);
    setIaOnlineSlice(null);
    setCMunicipio('all');
    setCGabarito('all');
    setCEscola('all');
    setCSerie('all');
    setCTurma('all');
    setCDisciplina('all');
    setMapCartao(null);
    setIaCartaoSlice(null);
  }, [selectedPeriod]);

  const loadOnlineEstados = useCallback(async () => {
    try {
      setLoadingFilters(true);
      const data = await fetchEvaluationFilterOptions({
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setOEstados(normEntities(data.estados));
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar estados.', variant: 'destructive' });
    } finally {
      setLoadingFilters(false);
    }
  }, [toast, periodoYm]);

  useEffect(() => {
    loadOnlineEstados();
  }, [loadOnlineEstados]);

  useEffect(() => {
    if (oEstado === 'all') {
      setOMunicipios([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchEvaluationFilterOptions({
          estado: oEstado,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setOMunicipios(normEntities(data.municipios));
      } catch {
        setOMunicipios([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [oEstado, periodoYm]);

  useEffect(() => {
    if (oEstado === 'all' || oMunicipio === 'all') {
      setOAvaliacoes([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchEvaluationFilterOptions({
          estado: oEstado,
          municipio: oMunicipio,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setOAvaliacoes(filterEvaluationsForDropdown(data.avaliacoes || []));
      } catch {
        setOAvaliacoes([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [oEstado, oMunicipio, periodoYm]);

  useEffect(() => {
    if (oEstado === 'all' || oMunicipio === 'all' || oAvaliacao === 'all') {
      setOEscolas([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchEvaluationFilterOptions({
          estado: oEstado,
          municipio: oMunicipio,
          avaliacao: oAvaliacao,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setOEscolas(normEntities(data.escolas));
      } catch {
        setOEscolas([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [oEstado, oMunicipio, oAvaliacao, periodoYm]);

  useEffect(() => {
    if (oEstado === 'all' || oMunicipio === 'all' || oAvaliacao === 'all') {
      setOSeries([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchEvaluationFilterOptions({
          estado: oEstado,
          municipio: oMunicipio,
          avaliacao: oAvaliacao,
          ...(oEscola !== 'all' ? { escola: oEscola } : {}),
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setOSeries(normEntities(data.series));
      } catch {
        setOSeries([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [oEstado, oMunicipio, oAvaliacao, oEscola, periodoYm]);

  useEffect(() => {
    if (oEstado === 'all' || oMunicipio === 'all' || oAvaliacao === 'all' || oSerie === 'all') {
      setOTurmas([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchEvaluationFilterOptions({
          estado: oEstado,
          municipio: oMunicipio,
          avaliacao: oAvaliacao,
          ...(oEscola !== 'all' ? { escola: oEscola } : {}),
          serie: oSerie,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setOTurmas(normEntities(data.turmas));
      } catch {
        setOTurmas([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [oEstado, oMunicipio, oAvaliacao, oEscola, oSerie, periodoYm]);

  const loadCartaoEstados = useCallback(async () => {
    try {
      setLoadingFilters(true);
      const data = await fetchAnswerSheetFilterOptions({
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setCEstados(normEntities(data.estados));
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar estados.', variant: 'destructive' });
    } finally {
      setLoadingFilters(false);
    }
  }, [toast, periodoYm]);

  useEffect(() => {
    loadCartaoEstados();
  }, [loadCartaoEstados]);

  useEffect(() => {
    if (cEstado === 'all') {
      setCMunicipios([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchAnswerSheetFilterOptions({
          estado: cEstado,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setCMunicipios(normEntities(data.municipios));
      } catch {
        setCMunicipios([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [cEstado, periodoYm]);

  useEffect(() => {
    if (cEstado === 'all' || cMunicipio === 'all') {
      setCGabaritos([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchAnswerSheetFilterOptions({
          estado: cEstado,
          municipio: cMunicipio,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setCGabaritos(normEntities(data.gabaritos));
      } catch {
        setCGabaritos([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [cEstado, cMunicipio, periodoYm]);

  useEffect(() => {
    if (cEstado === 'all' || cMunicipio === 'all' || cGabarito === 'all') {
      setCEscolas([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchAnswerSheetFilterOptions({
          estado: cEstado,
          municipio: cMunicipio,
          gabarito: cGabarito,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setCEscolas(normEntities(data.escolas));
      } catch {
        setCEscolas([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [cEstado, cMunicipio, cGabarito, periodoYm]);

  useEffect(() => {
    if (cEstado === 'all' || cMunicipio === 'all' || cGabarito === 'all') {
      setCSeries([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchAnswerSheetFilterOptions({
          estado: cEstado,
          municipio: cMunicipio,
          gabarito: cGabarito,
          ...(cEscola !== 'all' ? { escola: cEscola } : {}),
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setCSeries(normEntities(data.series));
      } catch {
        setCSeries([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [cEstado, cMunicipio, cGabarito, cEscola, periodoYm]);

  useEffect(() => {
    if (cEstado === 'all' || cMunicipio === 'all' || cGabarito === 'all' || cSerie === 'all') {
      setCTurmas([]);
      return;
    }
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await fetchAnswerSheetFilterOptions({
          estado: cEstado,
          municipio: cMunicipio,
          gabarito: cGabarito,
          ...(cEscola !== 'all' ? { escola: cEscola } : {}),
          serie: cSerie,
          ...(periodoYm ? { periodo: periodoYm } : {}),
        });
        setCTurmas(normEntities(data.turmas));
      } catch {
        setCTurmas([]);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, [cEstado, cMunicipio, cGabarito, cEscola, cSerie, periodoYm]);

  const canLoadOnlineMap =
    oEstado !== 'all' &&
    oMunicipio !== 'all' &&
    oAvaliacao !== 'all';

  const canLoadCartaoMap =
    cEstado !== 'all' &&
    cMunicipio !== 'all' &&
    cGabarito !== 'all';

  const loadOnlineMap = useCallback(async () => {
    if (!canLoadOnlineMap) {
      toast({
        title: 'Filtros incompletos',
        description: 'Selecione estado, município e avaliação.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLoadingMap(true);
      clearMapIaOnlineTimer();
      setIaOnlineSlice(null);
      setIaManualOnlineSeq(0);
      const data = await fetchSkillsMapOnline({
        estado: oEstado,
        municipio: oMunicipio,
        avaliacao: oAvaliacao,
        escola: oEscola,
        serie: oSerie,
        turma: oTurma,
        disciplina: oDisciplina,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setMapOnline(data);
      setODisciplinas(data.disciplinas_disponiveis || []);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string; details?: string } } };
      toast({
        title: 'Erro ao carregar mapa',
        description: ax.response?.data?.details || ax.response?.data?.error || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoadingMap(false);
    }
  }, [
    canLoadOnlineMap,
    oEstado,
    oMunicipio,
    oAvaliacao,
    oEscola,
    oSerie,
    oTurma,
    oDisciplina,
    periodoYm,
    toast,
    clearMapIaOnlineTimer,
  ]);

  const loadCartaoMap = useCallback(async () => {
    if (!canLoadCartaoMap) {
      toast({
        title: 'Filtros incompletos',
        description: 'Selecione estado, município e gabarito.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLoadingMap(true);
      clearMapIaCartaoTimer();
      setIaCartaoSlice(null);
      setIaManualCartaoSeq(0);
      const data = await fetchSkillsMapCartao({
        estado: cEstado,
        municipio: cMunicipio,
        gabarito: cGabarito,
        escola: cEscola,
        serie: cSerie,
        turma: cTurma,
        disciplina: cDisciplina,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setMapCartao(data);
      setCDisciplinas(data.disciplinas_disponiveis || []);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string; details?: string } } };
      toast({
        title: 'Erro ao carregar mapa',
        description: ax.response?.data?.details || ax.response?.data?.error || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoadingMap(false);
    }
  }, [
    canLoadCartaoMap,
    cEstado,
    cMunicipio,
    cGabarito,
    cEscola,
    cSerie,
    cTurma,
    cDisciplina,
    periodoYm,
    toast,
    clearMapIaCartaoTimer,
  ]);

  useEffect(() => {
    if (!canLoadOnlineMap) return;
    void loadOnlineMap();
  }, [canLoadOnlineMap, loadOnlineMap]);

  useEffect(() => {
    if (!canLoadCartaoMap) return;
    void loadCartaoMap();
  }, [canLoadCartaoMap, loadCartaoMap]);

  useEffect(() => {
    if (!canLoadOnlineMap || !mapOnline) {
      clearMapIaOnlineTimer();
      setIaOnlineSlice(null);
      return;
    }
    if (iaManualOnlineSeq === 0) {
      return;
    }

    let cancelled = false;
    mapIaOnlineGenRef.current += 1;
    const gen = mapIaOnlineGenRef.current;

    clearMapIaOnlineTimer();
    setIaOnlineSlice({ analise_ia_status: 'processing' });

    const pollOnlineIa = async (attempt: number) => {
      if (cancelled || gen !== mapIaOnlineGenRef.current) return;
      const ia = await fetchSkillsMapOnlineAnaliseIa({
        estado: oEstado,
        municipio: oMunicipio,
        avaliacao: oAvaliacao,
        escola: oEscola,
        serie: oSerie,
        turma: oTurma,
        disciplina: oDisciplina,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });

      if (cancelled || gen !== mapIaOnlineGenRef.current) return;

      if (!ia) {
        clearMapIaOnlineTimer();
        setIaOnlineSlice({
          analise_ia_status: 'error',
          analise_ia: { error: 'Falha ao consultar analise IA', details: '' },
        });
        return;
      }

      const st = ia.analise_ia_status ?? 'processing';
      if (st === 'processing') {
        setIaOnlineSlice({
          analise_ia_status: 'processing',
          analise_ia_cache_key: ia.analise_ia_cache_key,
        });
        const delayMs = Math.min(4000, 1000 + attempt * 500);
        clearMapIaOnlineTimer();
        mapIaOnlineTimeoutRef.current = window.setTimeout(() => void pollOnlineIa(attempt + 1), delayMs);
        return;
      }

      clearMapIaOnlineTimer();

      if (st === 'error') {
        setIaOnlineSlice({
          analise_ia_status: 'error',
          analise_ia_cache_key: ia.analise_ia_cache_key,
          analise_ia: {
            error: readTrimMessage(ia.error) || 'Erro ao gerar análise',
            details: readTrimMessage(ia.details),
          },
        });
        return;
      }

      setIaOnlineSlice({
        analise_ia_status: 'ready',
        analise_ia_cache_key: ia.analise_ia_cache_key,
        analise_ia: ia.analise_ia ?? {},
      });
    };

    void pollOnlineIa(0);

    return () => {
      cancelled = true;
      clearMapIaOnlineTimer();
    };
  }, [
    canLoadOnlineMap,
    mapOnline,
    oEstado,
    oMunicipio,
    oAvaliacao,
    oEscola,
    oSerie,
    oTurma,
    oDisciplina,
    periodoYm,
    iaManualOnlineSeq,
    clearMapIaOnlineTimer,
  ]);

  useEffect(() => {
    if (!canLoadCartaoMap || !mapCartao) {
      clearMapIaCartaoTimer();
      setIaCartaoSlice(null);
      return;
    }
    if (iaManualCartaoSeq === 0) {
      return;
    }

    let cancelled = false;
    mapIaCartaoGenRef.current += 1;
    const gen = mapIaCartaoGenRef.current;

    clearMapIaCartaoTimer();
    setIaCartaoSlice({ analise_ia_status: 'processing' });

    const pollCartaoIa = async (attempt: number) => {
      if (cancelled || gen !== mapIaCartaoGenRef.current) return;
      const ia = await fetchSkillsMapCartaoAnaliseIa({
        estado: cEstado,
        municipio: cMunicipio,
        gabarito: cGabarito,
        escola: cEscola,
        serie: cSerie,
        turma: cTurma,
        disciplina: cDisciplina,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });

      if (cancelled || gen !== mapIaCartaoGenRef.current) return;

      if (!ia) {
        clearMapIaCartaoTimer();
        setIaCartaoSlice({
          analise_ia_status: 'error',
          analise_ia: { error: 'Falha ao consultar analise IA', details: '' },
        });
        return;
      }

      const st = ia.analise_ia_status ?? 'processing';
      if (st === 'processing') {
        setIaCartaoSlice({
          analise_ia_status: 'processing',
          analise_ia_cache_key: ia.analise_ia_cache_key,
        });
        const delayMs = Math.min(4000, 1000 + attempt * 500);
        clearMapIaCartaoTimer();
        mapIaCartaoTimeoutRef.current = window.setTimeout(() => void pollCartaoIa(attempt + 1), delayMs);
        return;
      }

      clearMapIaCartaoTimer();

      if (st === 'error') {
        setIaCartaoSlice({
          analise_ia_status: 'error',
          analise_ia_cache_key: ia.analise_ia_cache_key,
          analise_ia: {
            error: readTrimMessage(ia.error) || 'Erro ao gerar análise',
            details: readTrimMessage(ia.details),
          },
        });
        return;
      }

      setIaCartaoSlice({
        analise_ia_status: 'ready',
        analise_ia_cache_key: ia.analise_ia_cache_key,
        analise_ia: ia.analise_ia ?? {},
      });
    };

    void pollCartaoIa(0);

    return () => {
      cancelled = true;
      clearMapIaCartaoTimer();
    };
  }, [
    canLoadCartaoMap,
    mapCartao,
    cEstado,
    cMunicipio,
    cGabarito,
    cEscola,
    cSerie,
    cTurma,
    cDisciplina,
    periodoYm,
    iaManualCartaoSeq,
    clearMapIaCartaoTimer,
  ]);

  const openErrosOnline = async (h: SkillsMapHabilidade) => {
    setDialogSkill(h);
    setDialogListaTab('acertaram');
    setDialogOpen(true);
    setDialogErros(null);
    setLoadingErros(true);
    try {
      const data = await fetchSkillsMapOnlineErros({
        estado: oEstado,
        municipio: oMunicipio,
        avaliacao: oAvaliacao,
        escola: oEscola,
        serie: oSerie,
        turma: oTurma,
        disciplina: oDisciplina,
        skill_id: h.skill_id,
        question_ref: h.question_ref ?? null,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setDialogErros(data);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar alunos.', variant: 'destructive' });
    } finally {
      setLoadingErros(false);
    }
  };

  const openErrosCartao = async (h: SkillsMapHabilidade) => {
    setDialogSkill(h);
    setDialogListaTab('acertaram');
    setDialogOpen(true);
    setDialogErros(null);
    setLoadingErros(true);
    try {
      const data = await fetchSkillsMapCartaoErros({
        estado: cEstado,
        municipio: cMunicipio,
        gabarito: cGabarito,
        escola: cEscola,
        serie: cSerie,
        turma: cTurma,
        disciplina: cDisciplina,
        skill_id: h.skill_id,
        bloco_disciplina: h.subject_id ?? null,
        question_ref: h.question_ref ?? null,
        ...(periodoYm ? { periodo: periodoYm } : {}),
      });
      setDialogErros(data);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar alunos.', variant: 'destructive' });
    } finally {
      setLoadingErros(false);
    }
  };

  const analiseIaPdfPayloadOnline =
    iaOnlineSlice?.analise_ia_status === 'ready' &&
    iaOnlineSlice.analise_ia &&
    typeof iaOnlineSlice.analise_ia === 'object' &&
    !Array.isArray(iaOnlineSlice.analise_ia)
      ? (iaOnlineSlice.analise_ia as Record<string, unknown>)
      : null;
  const analiseIaPdfPayloadCartao =
    iaCartaoSlice?.analise_ia_status === 'ready' &&
    iaCartaoSlice.analise_ia &&
    typeof iaCartaoSlice.analise_ia === 'object' &&
    !Array.isArray(iaCartaoSlice.analise_ia)
      ? (iaCartaoSlice.analise_ia as Record<string, unknown>)
      : null;

  const handlePdfGeral = () => {
    const run = async () => {
      if (tab === 'online') {
        if (!mapOnline) return;
        await downloadSkillsHeatMapGeneralPdf({
          modo: 'online',
          map: mapOnline,
          filtrosTexto: filtrosPdfOnline,
          periodoLabel: periodoLabelText,
          meta: filtrosMetaOnline,
          analiseIa: analiseIaPdfPayloadOnline,
        });
      } else {
        if (!mapCartao) return;
        await downloadSkillsHeatMapGeneralPdf({
          modo: 'cartao',
          map: mapCartao,
          filtrosTexto: filtrosPdfCartao,
          periodoLabel: periodoLabelText,
          meta: filtrosMetaCartao,
          analiseIa: analiseIaPdfPayloadCartao,
        });
      }
      toast({ title: 'PDF gerado', description: 'O download deve começar em instantes.' });
    };
    run().catch(() => {
      toast({ title: 'Erro', description: 'Não foi possível gerar o PDF.', variant: 'destructive' });
    });
  };

  const handlePdfHabilidade = () => {
    if (!dialogSkill || !dialogErros) return;
    const run = async () => {
      await downloadSkillsHeatMapSkillPdf({
        modo: tab,
        skill: dialogSkill!,
        erros: dialogErros!,
        filtrosTexto: tab === 'online' ? filtrosPdfOnline : filtrosPdfCartao,
        periodoLabel: periodoLabelText,
        meta: tab === 'online' ? filtrosMetaOnline : filtrosMetaCartao,
        analiseIa: tab === 'online' ? analiseIaPdfPayloadOnline : analiseIaPdfPayloadCartao,
      });
      toast({ title: 'PDF gerado', description: 'O download deve começar em instantes.' });
    };
    run().catch(() => {
      toast({ title: 'Erro', description: 'Não foi possível gerar o PDF.', variant: 'destructive' });
    });
  };

  return (
    <div className="container max-w-[1400px] py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Thermometer className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mapa de habilidades</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho por habilidade em faixas de acertos; clique em uma habilidade para ver detalhes e listas de acertos e erros (apenas participantes).
          </p>
        </div>
      </div>

      <ResultsPeriodMonthYearPicker
        value={selectedPeriod}
        onChange={setSelectedPeriod}
        disabled={loadingFilters}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'online' | 'cartao')}>
        <div className="flex w-full min-w-0 flex-row flex-wrap items-center justify-between gap-3">
          <TabsList className="min-h-0 min-w-0 flex-1 basis-[min(100%,28rem)] justify-start">
            <TabsTrigger value="online">Avaliação online</TabsTrigger>
            <TabsTrigger value="cartao">Cartão-resposta</TabsTrigger>
          </TabsList>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePdfGeral}
              disabled={
                loadingMap ||
                (tab === 'online' ? !mapOnline : !mapCartao)
              }
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              PDF geral
            </Button>
            <Button
              type="button"
              onClick={() => (tab === 'online' ? void loadOnlineMap() : void loadCartaoMap())}
              disabled={
                loadingMap ||
                loadingFilters ||
                (tab === 'online' ? !canLoadOnlineMap : !canLoadCartaoMap)
              }
              className="gap-2"
            >
              {loadingMap ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar mapa
            </Button>
          </div>
        </div>

        <TabsContent value="online" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                <Select value={oEstado} onValueChange={(v) => { setOEstado(v); setOMunicipio('all'); setOAvaliacao('all'); setOEscola('all'); setOSerie('all'); setOTurma('all'); setODisciplina('all'); setMapOnline(null); }}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {oEstados.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Município</label>
                <Select value={oMunicipio} onValueChange={(v) => { setOMunicipio(v); setOAvaliacao('all'); setOEscola('all'); setOSerie('all'); setOTurma('all'); setODisciplina('all'); setMapOnline(null); }} disabled={oEstado === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Município" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {oMunicipios.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <EvaluationInstrumentPicker
                label="Avaliação"
                className="space-y-1 [&_label]:text-xs [&_label]:font-medium [&_label]:text-muted-foreground"
                estado={oEstado}
                municipio={oMunicipio}
                periodo={periodoYm}
                estadoLabel={oEstados.find((x) => x.id === oEstado)?.nome}
                municipioLabel={oMunicipios.find((x) => x.id === oMunicipio)?.nome}
                periodoLabel={periodoYm}
                value={oAvaliacao}
                onChange={(v) => {
                  setOAvaliacao(v);
                  setOEscola('all');
                  setOSerie('all');
                  setOTurma('all');
                  setODisciplina('all');
                  setMapOnline(null);
                }}
                disabled={oMunicipio === 'all'}
                loading={loadingFilters}
                allowAll
                allLabel="Todos"
                placeholder="Avaliação"
              />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Escola</label>
                <Select value={oEscola} onValueChange={(v) => { setOEscola(v); setOSerie('all'); setOTurma('all'); setMapOnline(null); }} disabled={oAvaliacao === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Escola" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {oEscolas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Série</label>
                <Select value={oSerie} onValueChange={(v) => { setOSerie(v); setOTurma('all'); setMapOnline(null); }} disabled={oAvaliacao === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Série" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {oSeries.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Turma</label>
                <Select value={oTurma} onValueChange={(v) => { setOTurma(v); setMapOnline(null); }} disabled={oSerie === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Turma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {oTurmas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Disciplina</label>
                <Select value={oDisciplina} onValueChange={(v) => { setODisciplina(v); setMapOnline(null); }}>
                  <SelectTrigger><SelectValue placeholder="Disciplina" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {oDisciplinas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {mapOnline && (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <MapSummaryCards
                  avaliacaoLabel={oAvaliacoes.find((x) => x.id === oAvaliacao)?.nome || '—'}
                  alunosEscopo={
                    mapOnline.total_alunos_escopo_turma ??
                    mapOnline.total_alunos_participantes ??
                    mapOnline.total_alunos_escopo ??
                    '—'
                  }
                  alunosParticipantes={
                    mapOnline.total_alunos_participantes ?? mapOnline.total_alunos_escopo ?? '—'
                  }
                />
                <HeatMapLegendInside />
                <HeatColumns
                  porFaixa={mapOnline.por_faixa}
                  onSkillClick={openErrosOnline}
                  gridClassName="mt-0"
                />
                {(mapOnline.total_alunos_escopo_turma != null ||
                  mapOnline.total_alunos_participantes != null ||
                  mapOnline.total_alunos_escopo != null) && (
                  <p className="text-sm text-muted-foreground">
                    Alunos no recorte (turma):{' '}
                    {mapOnline.total_alunos_escopo_turma ?? mapOnline.total_alunos_participantes ?? mapOnline.total_alunos_escopo}
                    {' · '}
                    Participantes:{' '}
                    {mapOnline.total_alunos_participantes ?? mapOnline.total_alunos_escopo ?? '—'}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {loadingMap && canLoadOnlineMap && !mapOnline && <AnalysisLoadingCard />}
          {mapOnline && (
            <Card className="shadow-sm border border-border">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    Análise com IA
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gere uma análise textual para o mapa e filtros exibidos. A consulta pode levar alguns segundos.
                  </p>
                </div>
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={loadingMap || iaOnlineSlice?.analise_ia_status === 'processing'}
                  onClick={() => {
                    clearMapIaOnlineTimer();
                    setIaOnlineSlice(null);
                    setIaManualOnlineSeq((n) => n + 1);
                  }}
                >
                  Gerar análise da IA para os dados mostrados
                </Button>
              </CardContent>
            </Card>
          )}
          {mapOnline && iaOnlineSlice?.analise_ia_status === 'processing' && <AnalysisLoadingCard />}
          {mapOnline && iaOnlineSlice?.analise_ia_status === 'error' && (
            <Card className="border-destructive/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Não foi possível carregar a análise de IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {readTrimMessage((iaOnlineSlice?.analise_ia as Record<string, unknown> | undefined)?.details) ||
                    readTrimMessage((iaOnlineSlice?.analise_ia as Record<string, unknown> | undefined)?.error) ||
                    'Tente novamente em instantes.'}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setIaManualOnlineSeq((n) => n + 1)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          )}
          {mapOnline && iaOnlineSlice?.analise_ia_status === 'ready' && (
              <AnalysisCard
                analysis={iaOnlineSlice.analise_ia as unknown}
                habilidadesMapa={mapOnline.habilidades}
              />
            )}
        </TabsContent>

        <TabsContent value="cartao" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                <Select value={cEstado} onValueChange={(v) => { setCEstado(v); setCMunicipio('all'); setCGabarito('all'); setCEscola('all'); setCSerie('all'); setCTurma('all'); setCDisciplina('all'); setMapCartao(null); }}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {cEstados.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Município</label>
                <Select value={cMunicipio} onValueChange={(v) => { setCMunicipio(v); setCGabarito('all'); setCEscola('all'); setCSerie('all'); setCTurma('all'); setCDisciplina('all'); setMapCartao(null); }} disabled={cEstado === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Município" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {cMunicipios.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <EvaluationInstrumentPicker
                  label="Gabarito / cartão"
                  className="space-y-1 [&_label]:text-xs [&_label]:font-medium [&_label]:text-muted-foreground"
                  estado={cEstado}
                  municipio={cMunicipio}
                  periodo={periodoYm}
                  reportEntityType={REPORT_ENTITY_TYPE_ANSWER_SHEET}
                  estadoLabel={cEstados.find((x) => x.id === cEstado)?.nome}
                  municipioLabel={cMunicipios.find((x) => x.id === cMunicipio)?.nome}
                  periodoLabel={periodoYm}
                  value={cGabarito}
                  onChange={(v) => {
                    setCGabarito(v);
                    setCEscola('all');
                    setCSerie('all');
                    setCTurma('all');
                    setCDisciplina('all');
                    setMapCartao(null);
                  }}
                  disabled={cMunicipio === 'all'}
                  loading={loadingFilters}
                  allowAll
                  allLabel="Todos"
                  placeholder="Gabarito"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Escola</label>
                <Select value={cEscola} onValueChange={(v) => { setCEscola(v); setCSerie('all'); setCTurma('all'); setMapCartao(null); }} disabled={cGabarito === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Escola" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {cEscolas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Série</label>
                <Select value={cSerie} onValueChange={(v) => { setCSerie(v); setCTurma('all'); setMapCartao(null); }} disabled={cGabarito === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Série" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {cSeries.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Turma</label>
                <Select value={cTurma} onValueChange={(v) => { setCTurma(v); setMapCartao(null); }} disabled={cSerie === 'all'}>
                  <SelectTrigger><SelectValue placeholder="Turma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {cTurmas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Disciplina (bloco)</label>
                <Select value={cDisciplina} onValueChange={(v) => { setCDisciplina(v); setMapCartao(null); }}>
                  <SelectTrigger><SelectValue placeholder="Disciplina" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {cDisciplinas.map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {mapCartao && (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <MapSummaryCards
                  avaliacaoLabel={cGabaritos.find((x) => x.id === cGabarito)?.nome || '—'}
                  alunosEscopo={
                    mapCartao.total_alunos_escopo_turma ??
                    mapCartao.total_alunos_participantes ??
                    mapCartao.total_alunos_escopo ??
                    '—'
                  }
                  alunosParticipantes={
                    mapCartao.total_alunos_participantes ?? mapCartao.total_alunos_escopo ?? '—'
                  }
                />
                <HeatMapLegendInside />
                <HeatColumns
                  porFaixa={mapCartao.por_faixa}
                  onSkillClick={openErrosCartao}
                  gridClassName="mt-0"
                />
                {(mapCartao.total_alunos_escopo_turma != null ||
                  mapCartao.total_alunos_participantes != null ||
                  mapCartao.total_alunos_escopo != null) && (
                  <p className="text-sm text-muted-foreground">
                    Alunos no recorte (turma):{' '}
                    {mapCartao.total_alunos_escopo_turma ?? mapCartao.total_alunos_participantes ?? mapCartao.total_alunos_escopo}
                    {' · '}
                    Participantes:{' '}
                    {mapCartao.total_alunos_participantes ?? mapCartao.total_alunos_escopo ?? '—'}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {loadingMap && canLoadCartaoMap && !mapCartao && <AnalysisLoadingCard />}
          {mapCartao && (
            <Card className="shadow-sm border border-border">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    Análise com IA
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gere uma análise textual para o mapa e filtros exibidos. A consulta pode levar alguns segundos.
                  </p>
                </div>
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={loadingMap || iaCartaoSlice?.analise_ia_status === 'processing'}
                  onClick={() => {
                    clearMapIaCartaoTimer();
                    setIaCartaoSlice(null);
                    setIaManualCartaoSeq((n) => n + 1);
                  }}
                >
                  Gerar análise da IA para os dados mostrados
                </Button>
              </CardContent>
            </Card>
          )}
          {mapCartao && iaCartaoSlice?.analise_ia_status === 'processing' && <AnalysisLoadingCard />}
          {mapCartao && iaCartaoSlice?.analise_ia_status === 'error' && (
            <Card className="border-destructive/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Não foi possível carregar a análise de IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {readTrimMessage((iaCartaoSlice?.analise_ia as Record<string, unknown> | undefined)?.details) ||
                    readTrimMessage((iaCartaoSlice?.analise_ia as Record<string, unknown> | undefined)?.error) ||
                    'Tente novamente em instantes.'}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setIaManualCartaoSeq((n) => n + 1)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          )}
          {mapCartao && iaCartaoSlice?.analise_ia_status === 'ready' && (
              <AnalysisCard
                analysis={iaCartaoSlice.analise_ia as unknown}
                habilidadesMapa={mapCartao.habilidades}
              />
            )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg leading-snug">
                    {dialogSkill ? skillDisplayTitle(dialogSkill) : 'Detalhe da habilidade'}
                  </DialogTitle>
                  {dialogSkill &&
                    (() => {
                      const dn = skillDisciplinaLabel(dialogSkill);
                      return dn ? (
                        <DialogDescription className="text-sm text-muted-foreground font-normal">
                          {dn}
                        </DialogDescription>
                      ) : null;
                    })()}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={handlePdfHabilidade}
                  disabled={loadingErros || !dialogSkill || !dialogErros}
                >
                  <FileDown className="h-4 w-4" />
                  PDF da habilidade
                </Button>
              </div>
            </DialogHeader>
            {dialogSkill && (dialogSkill.descricao || '').trim() ? (
              <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground">
                {(dialogSkill.descricao || '').trim()}
              </div>
            ) : null}
            {(() => {
              const mapAtual = tab === 'online' ? mapOnline : mapCartao;
              const nTurma =
                mapAtual?.total_alunos_escopo_turma ??
                mapAtual?.total_alunos_participantes ??
                mapAtual?.total_alunos_escopo;
              const nPartMap =
                mapAtual?.total_alunos_participantes ?? mapAtual?.total_alunos_escopo;
              if (nTurma == null && nPartMap == null) return null;
              return (
                <p className="mt-3 text-xs text-muted-foreground">
                  Recorte do mapa — alunos na turma: {nTurma ?? '—'} · participantes no mapa:{' '}
                  {nPartMap ?? '—'}
                </p>
              );
            })()}
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-4">
            {loadingErros && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingErros && dialogErros && dialogSkill && (
              <div className="flex h-full min-h-[320px] flex-col gap-4">
                {(() => {
                  const tot = dialogErros.total_alunos_escopo;
                  const nErr = dialogErros.total_alunos_que_erraram;
                  const nOk =
                    dialogErros.total_alunos_que_acertaram ?? Math.max(0, tot - nErr);
                  const pe = dialogErros.percentual_erros;
                  const pa =
                    dialogErros.percentual_acertos ?? (tot > 0 ? (nOk / tot) * 100 : 0);
                  return (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-md border bg-card px-3 py-2 text-center">
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">
                          Participantes
                        </div>
                        <div className="text-lg font-semibold tabular-nums">{tot}</div>
                      </div>
                      <div className="rounded-md border bg-emerald-500/10 px-3 py-2 text-center">
                        <div className="text-[11px] font-medium uppercase text-emerald-800 dark:text-emerald-200">
                          Acertaram
                        </div>
                        <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {nOk}{' '}
                          <span className="text-xs font-normal opacity-80">
                            ({pa.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div className="rounded-md border bg-red-500/10 px-3 py-2 text-center">
                        <div className="text-[11px] font-medium uppercase text-red-800 dark:text-red-200">
                          Erraram
                        </div>
                        <div className="text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">
                          {nErr}{' '}
                          <span className="text-xs font-normal opacity-80">
                            ({pe.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <Tabs
                  value={dialogListaTab}
                  onValueChange={(v) => setDialogListaTab(v as 'acertaram' | 'erraram')}
                  className="flex min-h-0 flex-1 flex-col gap-2"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="acertaram">
                      Acertaram (
                      {dialogErros.total_alunos_que_acertaram ??
                        Math.max(
                          0,
                          dialogErros.total_alunos_escopo - dialogErros.total_alunos_que_erraram
                        )}
                      )
                    </TabsTrigger>
                    <TabsTrigger value="erraram">
                      Erraram ({dialogErros.total_alunos_que_erraram})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="acertaram" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <ScrollArea className="h-[min(40vh,320px)] rounded-md border">
                      <ul className="space-y-0 p-2 text-sm">
                        {(dialogErros.alunos_que_acertaram ?? []).length === 0 ? (
                          <li className="px-2 py-6 text-center text-muted-foreground">
                            Nenhum participante acertou todos os itens desta habilidade.
                          </li>
                        ) : (
                          (dialogErros.alunos_que_acertaram ?? []).map((a) => (
                            <li
                              key={a.id}
                              className="border-b border-border/50 px-2 py-2 last:border-0"
                            >
                              <div className="font-medium text-emerald-600 dark:text-emerald-400">
                                {a.nome}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {[a.escola, a.serie, a.turma, a.shift ? getClassShiftLabel(a.shift) : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="erraram" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <ScrollArea className="h-[min(40vh,320px)] rounded-md border">
                      <ul className="space-y-0 p-2 text-sm">
                        {(dialogErros.alunos_que_erraram ?? dialogErros.alunos).length === 0 ? (
                          <li className="px-2 py-6 text-center text-muted-foreground">
                            Nenhum participante errou itens desta habilidade.
                          </li>
                        ) : (
                          (dialogErros.alunos_que_erraram ?? dialogErros.alunos).map((a) => (
                            <li
                              key={a.id}
                              className="border-b border-border/50 px-2 py-2 last:border-0"
                            >
                              <div className="font-medium text-red-600 dark:text-red-400">{a.nome}</div>
                              <div className="text-xs text-muted-foreground">
                                {[a.escola, a.serie, a.turma, a.shift ? getClassShiftLabel(a.shift) : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  Listas e percentuais consideram apenas <strong>participantes</strong> (com prova ou cartão
                  válido), excluindo faltosos.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
