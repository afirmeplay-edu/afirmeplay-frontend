/** Valor da aba "Criar Nova" (formulário inline abaixo do seletor de abas). */
export const CREATE_EVALUATION_TAB = "create" as const;

/** Estilo compartilhado das abas (divisões + estado ativo + foco visível). */
export const evaluationsTabTriggerClass =
  "group relative flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-none border-0 px-3 py-2.5 text-center text-xs font-medium leading-snug shadow-none transition-colors duration-200 sm:min-h-12 sm:px-4 sm:text-sm " +
  "text-muted-foreground hover:bg-background/70 hover:text-foreground " +
  "focus-visible:z-[2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "data-[state=active]:z-[1] data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm " +
  "data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:h-[3px] data-[state=active]:after:rounded-t-sm data-[state=active]:after:bg-primary data-[state=active]:after:content-['']";
