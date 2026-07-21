import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Paleta fixa (referência SAEB / tema InnovPlay) — não depende do tema claro/escuro */
const CHART_PALETTE = [
  { color: '#4B218E', textOnBar: '#FFFFFF' },
  { color: '#3B82F6', textOnBar: '#FFFFFF' },
  { color: '#DDD6FE', textOnBar: '#1F2937' },
  { color: '#7C3AED', textOnBar: '#FFFFFF' },
] as const;

const BAR_FILL_COLOR = '#3B82F6';
const BAR_TRACK_COLOR = '#E8ECF4';
const LONG_LABEL_THRESHOLD = 40;

export const PROFILE_TAB_ORDER = [
  'perfilDemografico',
  'contextoFamiliar',
  'trajetoriaEscolar',
  'ambienteEscolar',
] as const;

/** Extrai o número global da pergunta a partir do ID (ex.: q22 → 22, Q010 → 10). */
export function parseQuestionNumberFromId(questionId: string): number | null {
  const qMatch = questionId.match(/^q(\d+)$/i);
  if (qMatch) return parseInt(qMatch[1], 10);

  const qPaddedMatch = questionId.match(/^Q0*(\d+)$/i);
  if (qPaddedMatch) return parseInt(qPaddedMatch[1], 10);

  return null;
}

type ProfileLike = { questoes?: string[]; dados?: Record<string, unknown> };

function getProfileQuestionIds(profile: ProfileLike): string[] {
  return profile.questoes?.length > 0
    ? profile.questoes
    : Object.keys(profile.dados ?? {});
}

function getProfileMinQuestionNumber(profile: ProfileLike): number {
  const numbers = getProfileQuestionIds(profile)
    .map(parseQuestionNumberFromId)
    .filter((n): n is number => n !== null);
  return numbers.length > 0 ? Math.min(...numbers) : Number.POSITIVE_INFINITY;
}

/** Ordena perfis pela primeira questão (q1 antes de q6, etc.), com fallback em PROFILE_TAB_ORDER. */
export function getOrderedProfileKeys(perfis: Record<string, ProfileLike>): string[] {
  return Object.keys(perfis).sort((a, b) => {
    const minA = getProfileMinQuestionNumber(perfis[a]);
    const minB = getProfileMinQuestionNumber(perfis[b]);
    if (minA !== minB) return minA - minB;

    const idxA = PROFILE_TAB_ORDER.indexOf(a as (typeof PROFILE_TAB_ORDER)[number]);
    const idxB = PROFILE_TAB_ORDER.indexOf(b as (typeof PROFILE_TAB_ORDER)[number]);
    const orderA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
    const orderB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
    if (orderA !== orderB) return orderA - orderB;

    return a.localeCompare(b, 'pt-BR');
  });
}

/** Mapa questionId → número global (parse do ID ou contador sequencial entre perfis). */
export function buildQuestionNumberMap(
  perfis: Record<string, { questoes?: string[]; dados?: Record<string, unknown> }>
): Record<string, number> {
  const map: Record<string, number> = {};
  let sequentialFallback = 0;

  for (const profileKey of getOrderedProfileKeys(perfis)) {
    const profile = perfis[profileKey];
    const questionIds =
      profile.questoes?.length > 0
        ? profile.questoes
        : Object.keys(profile.dados ?? {});

    for (const questionId of questionIds) {
      if (questionId in map) continue;

      const parsed = parseQuestionNumberFromId(questionId);
      if (parsed !== null) {
        map[questionId] = parsed;
      } else {
        sequentialFallback += 1;
        map[questionId] = sequentialFallback;
      }
    }
  }

  return map;
}

export interface ProfileQuestion {
  textoPergunta: string;
  tipo: string;
  contagem: Record<string, number>;
  totalRespostas: number;
  subperguntas?: Record<string, {
    texto: string;
    contagem: Record<string, number>;
  }>;
}

function formatRespondentCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatOptionStats(pct: number, count: number): string {
  const verb = count === 1 ? 'respondeu' : 'responderam';
  return `${pct}% · ${formatRespondentCount(count)} ${verb}`;
}

function formatRespondentVerb(count: number): string {
  const verb = count === 1 ? 'respondeu' : 'responderam';
  return `${formatRespondentCount(count)} ${verb}`;
}

function getPercentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function getOptionSortIndex(label: string): number {
  const normalized = label.toLowerCase().trim();

  if (/discordo\s+totalmente|totalmente\s+discordo/.test(normalized)) return 3;
  if (/\bdiscordo\b/.test(normalized)) return 2;
  if (/concordo\s+totalmente|totalmente\s+concordo/.test(normalized)) return 1;
  if (/\bconcordo\b/.test(normalized)) return 0;

  if (/nunca|nenhum/.test(normalized)) return 0;
  if (/vez em quando|às vezes|as vezes|maioria/.test(normalized)) return 1;
  if (/sempre|todos/.test(normalized)) return 2;
  return 99;
}

function getPaletteStyle(index: number) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

function getSubquestionOptionStyle(label: string, index: number) {
  const sortIndex = getOptionSortIndex(label);
  return getPaletteStyle(sortIndex < 99 ? sortIndex : index);
}

function sortSubquestionOptions(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const orderA = getOptionSortIndex(a);
    const orderB = getOptionSortIndex(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, 'pt-BR');
  });
}

function collectSubquestionOptionLabels(
  subperguntas: Record<string, { texto: string; contagem: Record<string, number> }>
): string[] {
  const labels = new Set<string>();
  Object.values(subperguntas).forEach((sub) => {
    Object.keys(sub.contagem ?? {}).forEach((label) => labels.add(label));
  });
  return sortSubquestionOptions(Array.from(labels));
}

type QuestionHeaderProps = {
  questionNumber: number;
  textoPergunta: string;
  totalRespostas: number;
};

function QuestionHeader({ questionNumber, textoPergunta, totalRespostas }: QuestionHeaderProps) {
  return (
    <div className="mb-5 space-y-1">
      <h4 className="text-base font-bold leading-snug text-foreground">
        {questionNumber} - {textoPergunta}
      </h4>
      <p className="text-sm text-muted-foreground">
        Total de respondentes: {formatRespondentCount(totalRespostas)}
      </p>
    </div>
  );
}

type HorizontalBarRowProps = {
  label: string;
  count: number;
  total: number;
};

function HorizontalBarRow({ label, count, total }: HorizontalBarRowProps) {
  const pct = getPercentage(count, total);
  const statsLabel = formatOptionStats(pct, count);
  const countLabel = formatRespondentVerb(count);
  const isLongLabel = label.length > LONG_LABEL_THRESHOLD;
  const barWidth = pct > 0 ? Math.max(pct, isLongLabel ? 10 : 15) : 0;

  const pctElement = (
    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
      {pct}%
    </span>
  );

  const countElement = (
    <span className="shrink-0 min-w-[5.5rem] text-right text-sm tabular-nums text-muted-foreground">
      {countLabel}
    </span>
  );

  const barElement = (
    <div
      className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-full"
      style={{ backgroundColor: BAR_TRACK_COLOR }}
    >
      {barWidth > 0 ? (
        <div
          className="flex h-full min-w-[4.5rem] items-center rounded-full"
          style={{ width: `${barWidth}%`, backgroundColor: BAR_FILL_COLOR }}
        >
          <span className="truncate px-3 text-sm" style={{ color: '#FFFFFF' }}>
            {label}
          </span>
        </div>
      ) : (
        <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-muted-foreground">
          <span className="truncate">{label}</span>
        </span>
      )}
    </div>
  );

  const tooltip = (trigger: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p className="font-medium">{label}</p>
        <p>{statsLabel}</p>
      </TooltipContent>
    </Tooltip>
  );

  if (isLongLabel) {
    return tooltip(
      <div className="cursor-default space-y-1.5">
        <p className="text-sm font-medium leading-snug text-foreground">{label}</p>
        <div className="flex items-center gap-3">
          {pctElement}
          {barElement}
          {countElement}
        </div>
      </div>
    );
  }

  return tooltip(
    <div className="flex cursor-default items-center gap-3">
      {pctElement}
      {barElement}
      {countElement}
    </div>
  );
}

type FormReportHorizontalBarsProps = {
  contagem: Record<string, number>;
  totalRespostas: number;
};

export function FormReportHorizontalBars({ contagem, totalRespostas }: FormReportHorizontalBarsProps) {
  const entries = Object.entries(contagem ?? {});

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma resposta registrada.</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map(([label, count]) => (
        <HorizontalBarRow key={label} label={label} count={Number(count)} total={totalRespostas} />
      ))}
    </div>
  );
}

type FormReportStackedSubQuestionsProps = {
  subperguntas: Record<string, { texto: string; contagem: Record<string, number> }>;
};

export function FormReportStackedSubQuestions({ subperguntas }: FormReportStackedSubQuestionsProps) {
  const legendLabels = useMemo(() => collectSubquestionOptionLabels(subperguntas), [subperguntas]);

  const legendItems = legendLabels.map((label, index) => ({
    label,
    ...getSubquestionOptionStyle(label, index),
  }));

  return (
    <div className="space-y-6">
      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm text-foreground">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(subperguntas).map(([subId, subData]) => {
          const subContagem = subData?.contagem ?? {};
          const subTotal = Object.values(subContagem).reduce((sum, value) => sum + Number(value), 0);

          const segments = legendLabels.map((label, index) => {
            const count = Number(subContagem[label] ?? 0);
            const pct = getPercentage(count, subTotal);
            const { color, textOnBar } = getSubquestionOptionStyle(label, index);
            return { label, count, pct, color, textOnBar };
          });

          return (
            <div key={subId} className="space-y-2">
              <p className="text-sm font-medium leading-snug text-foreground">{subData.texto}</p>
              <div
                className="flex h-10 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: BAR_TRACK_COLOR }}
              >
                {segments.map((segment) => {
                  if (segment.pct <= 0) return null;
                  const statsLabel = formatOptionStats(segment.pct, segment.count);
                  return (
                    <Tooltip key={segment.label}>
                      <TooltipTrigger asChild>
                        <div
                          className="flex cursor-default items-center justify-center overflow-hidden"
                          style={{
                            width: `${segment.pct}%`,
                            backgroundColor: segment.color,
                            minWidth: segment.pct >= 6 ? undefined : 0,
                          }}
                        >
                          {segment.pct >= 6 && (
                            <span
                              className="px-1 text-xs font-semibold"
                              style={{ color: segment.textOnBar }}
                            >
                              {segment.pct}%
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="font-medium">{segment.label}</p>
                        <p>{statsLabel}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {subTotal === 0 && (
                  <span className="flex flex-1 items-center px-3 text-sm text-muted-foreground">
                    Sem respostas
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FormReportQuestionCardProps = {
  questionNumber: number;
  questionData: ProfileQuestion;
  questionId: string;
  className?: string;
};

export function FormReportQuestionCard({
  questionNumber,
  questionData,
  questionId,
  className,
}: FormReportQuestionCardProps) {
  const hasSubperguntas =
    questionData.subperguntas && Object.keys(questionData.subperguntas).length > 0;
  const totalRespostas = questionData.totalRespostas ?? 0;

  return (
    <Card className={cn('shadow-sm', className)}>
      <CardContent className="pt-6">
        <QuestionHeader
          questionNumber={questionNumber}
          textoPergunta={questionData.textoPergunta ?? questionId}
          totalRespostas={totalRespostas}
        />
        {hasSubperguntas ? (
          <FormReportStackedSubQuestions subperguntas={questionData.subperguntas!} />
        ) : (
          <FormReportHorizontalBars
            contagem={questionData.contagem ?? {}}
            totalRespostas={totalRespostas}
          />
        )}
      </CardContent>
    </Card>
  );
}

type FormReportProfileTabContentProps = {
  profileTitle: string;
  profileData: {
    nome?: string;
    questoes?: string[];
    dados?: Record<string, ProfileQuestion>;
  };
  profileKey: string;
  questionNumberById: Record<string, number>;
};

export function FormReportProfileTabContent({
  profileTitle,
  profileData,
  profileKey,
  questionNumberById,
}: FormReportProfileTabContentProps) {
  const questionIds =
    profileData.questoes?.length > 0
      ? profileData.questoes
      : Object.keys(profileData.dados ?? {});

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg px-4 py-3"
        style={{ backgroundColor: '#E0E7FF' }}
      >
        <h3 className="text-lg font-bold" style={{ color: '#4B218E' }}>
          {profileTitle}
        </h3>
      </div>

      <div className="space-y-6">
        {questionIds.map((questionId, index) => {
          const questionData = profileData.dados?.[questionId];
          if (!questionData) return null;

          const questionNumber =
            questionNumberById[questionId] ??
            parseQuestionNumberFromId(questionId) ??
            index + 1;

          return (
            <FormReportQuestionCard
              key={`${profileKey}-${questionId}`}
              questionNumber={questionNumber}
              questionData={questionData}
              questionId={questionId}
            />
          );
        })}
      </div>
    </div>
  );
}
