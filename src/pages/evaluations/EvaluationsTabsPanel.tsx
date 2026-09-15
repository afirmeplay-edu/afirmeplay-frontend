import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ReadyEvaluations } from "@/components/evaluations/ReadyEvaluations";
import { DigitalToPhysicalTabContent } from "./DigitalToPhysicalTabContent";
import { PhysicalCorrectionTabContent } from "./PhysicalCorrectionTabContent";
import { CreateEvaluationTabContent } from "./CreateEvaluationTabContent";
import ErrorBoundary from "@/components/evaluations/ErrorBoundary";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, ClipboardCheck, FileText, Plus } from "lucide-react";
import {
  CREATE_EVALUATION_TAB,
  evaluationsTabTriggerClass,
} from "./evaluationsPage.constants";

interface EvaluationsTabsPanelProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  isProfessor: boolean;
  isCorretor: boolean;
}

export function EvaluationsTabsPanel({
  activeTab,
  onTabChange,
  isProfessor,
  isCorretor,
}: EvaluationsTabsPanelProps) {
  const handleValueChange = (value: string) => {
    if (isCorretor && value !== "correction") {
      // Mantém o corretor apenas na aba de correção.
      onTabChange("correction");
      return;
    }

    onTabChange(value);
  };

  const handleCreateDone = () => {
    onTabChange("ready");
  };

  return (
    <section
      aria-labelledby="evaluations-tabs-heading"
      className="space-y-6 scroll-mt-4"
    >
      <h2 id="evaluations-tabs-heading" className="sr-only">
        Listagens e ações de avaliações
      </h2>

      <Tabs
        value={activeTab}
        onValueChange={handleValueChange}
        className="w-full space-y-6"
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-border/50">
          <TabsList
            aria-label="Alternar entre seções da central de avaliações"
            className={cn(
              "flex h-auto w-full flex-col divide-y divide-border rounded-none bg-muted/40 p-0 text-muted-foreground",
              "sm:flex-row sm:divide-x sm:divide-y-0 sm:rounded-none"
            )}
          >
            {!isCorretor && (
              <TabsTrigger
                value="ready"
                className={evaluationsTabTriggerClass}
                title="Ver avaliações que você criou ou gerencia"
              >
                <FileText
                  className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:opacity-100"
                  aria-hidden
                />
                <span className="min-w-0 break-words sm:truncate">
                  Minhas Avaliações
                </span>
              </TabsTrigger>
            )}

            {!isCorretor && !isProfessor && (
              <TabsTrigger
                value="all"
                className={evaluationsTabTriggerClass}
                title="Ver todas as avaliações do sistema"
              >
                <FileText
                  className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:opacity-100"
                  aria-hidden
                />
                <span className="min-w-0 break-words sm:truncate">
                  Todas Avaliações
                </span>
              </TabsTrigger>
            )}

            {!isCorretor && (
              <TabsTrigger
                value="digital-to-physical"
                className={evaluationsTabTriggerClass}
                title="Converter avaliação digital em prova física"
              >
                <ArrowRightLeft
                  className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:opacity-100"
                  aria-hidden
                />
                <span className="min-w-0 break-words sm:truncate">
                  Transformar Digital em Física
                </span>
              </TabsTrigger>
            )}

            <TabsTrigger
              value="correction"
              className={evaluationsTabTriggerClass}
              title="Abrir workspace para correção da prova física"
            >
              <ClipboardCheck
                className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:opacity-100"
                aria-hidden
              />
              <span className="min-w-0 break-words sm:truncate">
                Correção
              </span>
            </TabsTrigger>

            {!isCorretor && (
              <TabsTrigger
                value={CREATE_EVALUATION_TAB}
                className={evaluationsTabTriggerClass}
                title="Criar uma nova avaliação digital nesta central"
              >
                <Plus
                  className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:opacity-100"
                  aria-hidden
                />
                <span className="min-w-0 break-words sm:truncate">
                  Criar Nova
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {!isCorretor && (
          <TabsContent value="ready" className="mt-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ErrorBoundary>
              <ReadyEvaluations showMyEvaluations={true} />
            </ErrorBoundary>
          </TabsContent>
        )}

        {!isCorretor && !isProfessor && (
          <TabsContent value="all" className="mt-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ErrorBoundary>
              <ReadyEvaluations showMyEvaluations={false} />
            </ErrorBoundary>
          </TabsContent>
        )}

        {!isCorretor && (
          <TabsContent
            value="digital-to-physical"
            className="mt-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ErrorBoundary>
              <DigitalToPhysicalTabContent
                isProfessor={isProfessor}
                tabActive={activeTab === "digital-to-physical"}
              />
            </ErrorBoundary>
          </TabsContent>
        )}

        <TabsContent
          value="correction"
          className="mt-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ErrorBoundary>
            <PhysicalCorrectionTabContent
              isProfessor={isProfessor}
              tabActive={activeTab === "correction"}
            />
          </ErrorBoundary>
        </TabsContent>

        {!isCorretor && (
          <TabsContent
            value={CREATE_EVALUATION_TAB}
            className="mt-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ErrorBoundary>
              {activeTab === CREATE_EVALUATION_TAB && (
                <CreateEvaluationTabContent onDone={handleCreateDone} />
              )}
            </ErrorBoundary>
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
