export type QuestionTypeMeta = {
  value:
    | "dissertativa"
    | "arrastar_soltar"
    | "ligar_colunas"
    | "ordenacao"
    | "completar_lacunas"
    | "substituicao"
    | "destacar_trechos"
    | "multipla_escolha"
    | "escrita_matematica"
    | "construcao_resposta";
  label: string;
  description: string;
  icon: string;
};

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  {
    value: "dissertativa",
    label: "Dissertativa",
    description: "Resposta aberta em texto livre com correção por palavras-chave e rubrica.",
    icon: "PenLine",
  },
  {
    value: "arrastar_soltar",
    label: "Arrastar e Soltar",
    description: "Aluno arrasta palavras, imagens ou números para áreas de destino.",
    icon: "MoveRight",
  },
  {
    value: "ligar_colunas",
    label: "Ligar Colunas",
    description: "Correspondência entre itens de duas colunas (1‑1, 1‑N ou N‑1).",
    icon: "Link2",
  },
  {
    value: "ordenacao",
    label: "Ordenação",
    description: "Ordenar etapas, números, textos ou acontecimentos.",
    icon: "ArrowUpDown",
  },
  {
    value: "completar_lacunas",
    label: "Completar Lacunas",
    description: "Texto com espaços; aceita múltiplas respostas e sinônimos.",
    icon: "SquareDashed",
  },
  {
    value: "substituicao",
    label: "Substituição",
    description: "Trocar palavras destacadas por equivalentes.",
    icon: "Replace",
  },
  {
    value: "destacar_trechos",
    label: "Destacar Trechos",
    description: "Aluno seleciona palavras ou frases no enunciado.",
    icon: "Highlighter",
  },
  {
    value: "multipla_escolha",
    label: "Múltipla Escolha",
    description: "1 ou mais alternativas corretas configuráveis.",
    icon: "ListChecks",
  },
  {
    value: "escrita_matematica",
    label: "Escrita Matemática",
    description: "Frações, potências, raízes e equações via LaTeX.",
    icon: "Sigma",
  },
  {
    value: "construcao_resposta",
    label: "Construção de Resposta",
    description: "Resposta em etapas: etapa 1 → etapa 2 → conclusão.",
    icon: "Layers",
  },
];

export const DIFFICULTY_LEVELS = [
  { value: "abaixo_basico", label: "Abaixo do básico", dots: 1 },
  { value: "basico", label: "Básico", dots: 2 },
  { value: "adequado", label: "Adequado", dots: 3 },
  { value: "avancado", label: "Avançado", dots: 4 },
] as const;

export const STATUS_META: Record<
  "rascunho" | "revisao" | "aprovada" | "arquivada",
  { label: string; className: string }
> = {
  rascunho: { label: "Rascunho", className: "bg-zinc-200 text-zinc-700" },
  revisao: { label: "Em revisão", className: "bg-amber-100 text-amber-800" },
  aprovada: { label: "Aprovada", className: "bg-emerald-100 text-emerald-800" },
  arquivada: { label: "Arquivada", className: "bg-zinc-100 text-zinc-500" },
};

export const KNOWLEDGE_AREAS = [
  "Linguagens",
  "Matemática",
  "Ciências da Natureza",
  "Ciências Humanas",
  "Ensino Religioso",
];

export const SCHOOL_YEARS = [
  "1º Ano EF",
  "2º Ano EF",
  "3º Ano EF",
  "4º Ano EF",
  "5º Ano EF",
  "6º Ano EF",
  "7º Ano EF",
  "8º Ano EF",
  "9º Ano EF",
  "1ª Série EM",
  "2ª Série EM",
  "3ª Série EM",
];

export const DEFAULT_RUBRIC_CRITERIA = [
  { name: "Domínio do conteúdo", weight: 30, maxScore: 10, minScore: 0, notes: "" },
  { name: "Coerência", weight: 15, maxScore: 10, minScore: 0, notes: "" },
  { name: "Argumentação", weight: 20, maxScore: 10, minScore: 0, notes: "" },
  { name: "Organização", weight: 10, maxScore: 10, minScore: 0, notes: "" },
  { name: "Ortografia e gramática", weight: 10, maxScore: 10, minScore: 0, notes: "" },
  { name: "Vocabulário", weight: 15, maxScore: 10, minScore: 0, notes: "" },
];
