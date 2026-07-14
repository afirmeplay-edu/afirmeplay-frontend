import { Suspense, useCallback, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type ReportTabValue = 'avaliacao' | 'cartao' | 'aluno';

function resolveTab(
  aba: string | null,
  defaultTab: ReportTabValue,
  hasAlunoTab: boolean
): ReportTabValue {
  if (aba === 'cartao') return 'cartao';
  if (aba === 'avaliacao') return 'avaliacao';
  if (aba === 'aluno' && hasAlunoTab) return 'aluno';
  return defaultTab === 'aluno' && !hasAlunoTab ? 'avaliacao' : defaultTab;
}

function TabFallback() {
  return (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
    </div>
  );
}

type DualReportEvalCartaoTabsProps = {
  defaultTab: ReportTabValue;
  /** Título da página (acima das abas). */
  title: string;
  /** Texto de apoio abaixo do título. */
  description?: string;
  /** Ícone ao lado do título (padrão visual das telas de relatório). */
  titleIcon?: LucideIcon;
  avaliacao: ReactNode;
  cartao: ReactNode;
  /** Aba opcional "Evolução por aluno" (ex.: Análise de Evolução). */
  aluno?: ReactNode;
  /** Rótulo da aba opcional (padrão: Evolução por aluno). */
  alunoTabLabel?: string;
};

/**
 * Abas Avaliação online / Cartão-resposta com ?aba=avaliacao|cartao na URL.
 * Opcionalmente inclui ?aba=aluno quando `aluno` é informado.
 * Só monta o conteúdo da aba ativa (evita duas cargas de API).
 */
export function DualReportEvalCartaoTabs({
  defaultTab,
  title,
  description,
  titleIcon: TitleIcon,
  avaliacao,
  cartao,
  aluno,
  alunoTabLabel = 'Evolução por aluno',
}: DualReportEvalCartaoTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get('aba');
  const hasAlunoTab = aluno != null;
  const value = useMemo(
    () => resolveTab(abaParam, defaultTab, hasAlunoTab),
    [abaParam, defaultTab, hasAlunoTab]
  );

  const onValueChange = useCallback(
    (v: string) => {
      const next = v as ReportTabValue;
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('aba', next);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
          {TitleIcon ? (
            <TitleIcon className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" aria-hidden />
          ) : null}
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-sm sm:text-base max-w-3xl">{description}</p>
        ) : null}
      </header>

      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className={`mb-0 w-full ${hasAlunoTab ? 'max-w-2xl' : 'max-w-md'}`}>
          <TabsTrigger value="avaliacao" className="flex-1">
            Avaliação online
          </TabsTrigger>
          <TabsTrigger value="cartao" className="flex-1">
            Cartão-resposta
          </TabsTrigger>
          {hasAlunoTab ? (
            <TabsTrigger value="aluno" className="flex-1">
              {alunoTabLabel}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>

      <div className="w-full min-w-0 pt-2 space-y-6">
        {value === 'avaliacao' && <Suspense fallback={<TabFallback />}>{avaliacao}</Suspense>}
        {value === 'cartao' && <Suspense fallback={<TabFallback />}>{cartao}</Suspense>}
        {hasAlunoTab && value === 'aluno' && <Suspense fallback={<TabFallback />}>{aluno}</Suspense>}
      </div>
    </div>
  );
}
