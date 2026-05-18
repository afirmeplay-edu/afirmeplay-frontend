import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/context/authContext";
import { hasCorretorStyleEvalAccess } from "@/utils/restrictedStaffAccess";
import { useEvaluationStats } from "@/hooks/use-cache";
import { EvaluationsStatsGrid } from "./EvaluationsStatsGrid";
import { EvaluationsTabsPanel } from "./EvaluationsTabsPanel";
import type { EvaluationDashboardStats } from "./evaluationsPage.types";

/** Link “pular para conteúdo” visível apenas ao focar (teclado). */
const SKIP_LINK_CLASS =
  "fixed left-4 top-0 z-[100] -translate-y-[120%] rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition-transform duration-200 focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";

type EvaluationStatsPayload = NonNullable<
  ReturnType<typeof useEvaluationStats>["data"]
>;

function buildDashboardStats(data: EvaluationStatsPayload): EvaluationDashboardStats {
  return {
    total: data.total,
    thisMonth: data.this_month,
    totalQuestions: data.total_questions,
    averageQuestions: data.average_questions,
    virtualEvaluations: data.virtual_evaluations,
    physicalEvaluations: data.physical_evaluations,
    completedEvaluations: data.by_status?.concluida ?? 0,
    pendingResults: data.by_status?.pendente ?? 0,
  };
}

const EMPTY_STATS: EvaluationDashboardStats = {
  total: 0,
  thisMonth: 0,
  totalQuestions: 0,
  averageQuestions: 0,
  virtualEvaluations: 0,
  physicalEvaluations: 0,
  completedEvaluations: 0,
  pendingResults: 0,
};

/**
 * Vista principal da Central de Avaliações para professores e administradores.
 * (Alunos usam `StudentEvaluations` na rota pai.)
 */
export function EvaluationsStaffView() {
  const { user } = useAuth();
  const isCorretor = hasCorretorStyleEvalAccess(user);
  const [activeTab, setActiveTab] = useState(isCorretor ? "correction" : "ready");
  const navigate = useNavigate();
  const { data: statsData, isLoading: isLoadingStats } = useEvaluationStats();

  const stats = useMemo(
    () =>
      statsData ? buildDashboardStats(statsData) : EMPTY_STATS,
    [statsData]
  );

  const isProfessor = user.role === "professor";

  return (
    <>
      <a href="#evaluations-main-content" className={SKIP_LINK_CLASS}>
        Ir para o conteúdo principal
      </a>

      <main
        id="evaluations-main-content"
        className="container mx-auto max-w-7xl px-3 py-6 sm:px-4 md:py-8"
        aria-labelledby="evaluations-page-title"
      >
        <div className="flex flex-col gap-8 md:gap-10">
          <header className="space-y-2 border-b border-border/60 pb-6 md:pb-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <h1
                  id="evaluations-page-title"
                  className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:gap-3 sm:text-3xl"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12"
                    aria-hidden
                  >
                    <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                  Central de Avaliações
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                  Acompanhe indicadores, gerencie provas e abra o assistente para
                  criar avaliações digitais.
                </p>
              </div>
            </div>
          </header>

          <EvaluationsStatsGrid stats={stats} isLoading={isLoadingStats} />

          <EvaluationsTabsPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            navigate={navigate}
            isProfessor={isProfessor}
            isCorretor={isCorretor}
          />
        </div>
      </main>
    </>
  );
}
