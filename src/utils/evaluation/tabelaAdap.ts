/** Situações de `tabela_adap` em GET /evaluation-results/avaliacoes. */
export type SituacaoAdap = "participou" | "pendente" | "inconsistente";

export interface TabelaAdapLinha {
  id: string;
  nome: string;
  nivel: number;
  rotulo: string;
  turma?: string;
  prova_origem_titulo?: string | null;
  acertos?: number | null;
  total_questoes?: number | null;
  nota?: number | null;
  proficiencia?: number | null;
  classificacao?: string | null;
  situacao: string;
}

export function labelSituacaoAdap(situacao: string | null | undefined): string {
  switch (situacao) {
    case "participou":
      return "Participou";
    case "pendente":
      return "Pendente";
    case "inconsistente":
      return "Inconsistente";
    default:
      return situacao?.trim() || "—";
  }
}

export function classeBadgeSituacaoAdap(situacao: string | null | undefined): string {
  switch (situacao) {
    case "participou":
      return "border-green-300 text-green-700 dark:text-green-400";
    case "pendente":
      return "border-amber-300 text-amber-700 dark:text-amber-400";
    case "inconsistente":
      return "border-red-300 text-red-600 dark:text-red-400";
    default:
      return "border-border text-muted-foreground";
  }
}

/** Nota, proficiência e acertos só existem quando a prova ADAP pareada foi a única realizada. */
export function adapTemResultado(situacao: string | null | undefined): boolean {
  return situacao === "participou";
}

export function resumoTabelaAdap(rows: Array<{ situacao?: string | null }>): string {
  const total = rows.length;
  const noun = total === 1 ? "aluno" : "alunos";
  let pareada = 0;
  let pendente = 0;
  let inconsistente = 0;
  for (const row of rows) {
    if (row.situacao === "participou") pareada += 1;
    else if (row.situacao === "pendente") pendente += 1;
    else if (row.situacao === "inconsistente") inconsistente += 1;
  }
  const parts = [`${total} ${noun}`];
  if (pareada > 0) {
    parts.push(pareada === 1 ? "1 com prova pareada" : `${pareada} com prova pareada`);
  }
  if (pendente > 0) {
    parts.push(pendente === 1 ? "1 pendente" : `${pendente} pendentes`);
  }
  if (inconsistente > 0) {
    parts.push(inconsistente === 1 ? "1 inconsistente" : `${inconsistente} inconsistentes`);
  }
  return parts.join(" · ");
}
