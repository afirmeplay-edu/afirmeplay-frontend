import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadyEvaluations } from "@/components/evaluations/ReadyEvaluations";
import { PhysicalTestWorkspace } from "@/pages/physical-test/PhysicalTestWorkspace";
import { cn } from "@/lib/utils";

interface PhysicalEvaluationWorkspaceTabContentProps {
  isProfessor: boolean;
  /**
   * Quando mudar de aba na Central, precisamos resetar a UI.
   * (para não manter workspace aberto em outra aba).
   */
  tabActive: boolean;
  mode: "transform" | "correction";
}

export function PhysicalEvaluationWorkspaceTabContent({
  isProfessor,
  tabActive,
  mode,
}: PhysicalEvaluationWorkspaceTabContentProps) {
  const [phase, setPhase] = useState<"list" | "workspace">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);

  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!tabActive) {
      setPhase("list");
      setSelectedId(null);
      setAnimating(false);
    }
  }, [tabActive]);

  const startWorkspace = useCallback((evaluationId: string) => {
    setSelectedId(evaluationId);
    setAnimating(true);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 0 : 300;

    window.setTimeout(() => {
      setPhase("workspace");
      setAnimating(false);
      queueMicrotask(() => {
        workspaceHeadingRef.current?.focus();
      });
    }, delay);
  }, []);

  const backToList = useCallback(() => {
    setPhase("list");
    setSelectedId(null);
  }, []);

  const isTransform = mode === "transform";

  return (
    <div className="space-y-4">
      {phase === "list" && (
        <>
          <Card
            role="region"
            aria-label={
              isTransform
                ? "Instruções para transformar avaliação digital em física"
                : "Instruções para correção de avaliação física"
            }
            className={
              isTransform
                ? "border-blue-200/80 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/25"
                : "border-purple-200/80 bg-purple-50/40 dark:border-purple-900 dark:bg-purple-950/25"
            }
          >
            <CardHeader className="pb-2">
              <CardTitle
                className={
                  isTransform
                    ? "flex items-center gap-2 text-base font-semibold text-blue-900 dark:text-blue-200"
                    : "flex items-center gap-2 text-base font-semibold text-purple-900 dark:text-purple-200"
                }
              >
                {isTransform ? (
                  <ArrowRightLeft
                    className="h-5 w-5 shrink-0"
                    aria-hidden
                  />
                ) : (
                  <ClipboardCheck
                    className="h-5 w-5 shrink-0"
                    aria-hidden
                  />
                )}
                {isTransform ? "Transformar Digital em Física" : "Correção de Prova Física"}
              </CardTitle>

              <CardDescription
                className={
                  isTransform
                    ? "text-sm text-blue-900/85 dark:text-blue-100/80"
                    : "text-sm text-purple-900/85 dark:text-purple-100/80"
                }
              >
                {isTransform ? (
                  <>
                    Selecione uma avaliação abaixo e clique em{" "}
                    <strong>Transformar em física</strong> para configurar a prova
                    física (cartões-resposta) aqui mesmo, sem sair da Central.
                    {" "}Somente avaliações <strong>já aplicadas</strong> ficam
                    disponíveis nesta lista.
                  </>
                ) : (
                  <>
                    Selecione uma avaliação e clique em{" "}
                    <strong>Abrir correção</strong> para corrigir a prova física
                    selecionada aqui mesmo, na Central.
                  </>
                )}
              </CardDescription>
            </CardHeader>
          </Card>

          <div
            aria-busy={animating}
            className={cn(
              "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
              animating &&
                "pointer-events-none opacity-50 motion-reduce:opacity-100 translate-x-1 motion-reduce:translate-x-0"
            )}
          >
            <ReadyEvaluations
              showMyEvaluations={isProfessor}
              variant={isTransform ? "transformTab" : "correctionTab"}
              onNavigateToPhysicalOverride={startWorkspace}
            />
          </div>
        </>
      )}

      {phase === "workspace" && selectedId ? (
        <div
          key={selectedId}
          role="region"
          aria-labelledby="physical-workspace-heading"
          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none"
        >
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={backToList}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Voltar à lista
            </Button>

            <h2
              id="physical-workspace-heading"
              ref={workspaceHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {isTransform ? "Configurar prova física" : "Correção da prova física"}
            </h2>
          </div>

          <PhysicalTestWorkspace
            testId={selectedId}
            embed
            initialTab={isTransform ? "forms" : "correction"}
            hideTabs={
              isTransform
                ? { correction: true }
                : {
                    // Modo "correction": mostrar somente a aba de correção
                    forms: true,
                  }
            }
          />
        </div>
      ) : null}
    </div>
  );
}

