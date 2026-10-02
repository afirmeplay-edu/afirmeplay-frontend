/** Opção inicial do filtro Alunos no menu Resultados. Troque só este valor. */
export const RESULTADOS_ALUNOS_FILTRO_PADRAO = "regular";

export const RESULTADOS_ALUNOS_OPCOES = [
  { value: "regular", label: "Regular" },
  { value: "regular_adap", label: "Regular + ADAP" },
  { value: "adap", label: "ADAP" },
  { value: "todos", label: "Todos" },
] as const;

export type ResultadosAlunosFiltro = (typeof RESULTADOS_ALUNOS_OPCOES)[number]["value"];

export function isResultadosAlunosFiltro(value: unknown): value is ResultadosAlunosFiltro {
  return RESULTADOS_ALUNOS_OPCOES.some((option) => option.value === value);
}

export function labelResultadosAlunosFiltro(value: string): string {
  return (
    RESULTADOS_ALUNOS_OPCOES.find((option) => option.value === value)?.label ??
    RESULTADOS_ALUNOS_OPCOES.find((option) => option.value === RESULTADOS_ALUNOS_FILTRO_PADRAO)?.label ??
    "Regular"
  );
}
