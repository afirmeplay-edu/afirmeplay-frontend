/**
 * Tipos e utilitários para as questões subjetivas (avaliação presencial com correção manual).
 *
 * Espelha o contrato `interactionConfig` documentado pelo backend para `POST/PUT /test`
 * e `POST/PUT /questions` (mesmo shape usado no protótipo "QUESTÃO SUBJETIVA").
 * O backend salva este objeto como JSON livre — não valida o schema interno, apenas
 * persiste e retorna. A correção é sempre manual via rubrica (SIM/PARCIAL/NAO/BRANCO).
 */

export type DragSlot = {
  label: string;
  answer: string;
  image?: string | null;
  images?: string[];
};

export function slotImages(slot: DragSlot): string[] {
  if (slot.images && slot.images.length) return slot.images;
  if (slot.image) return [slot.image];
  return [];
}

export type Pair = {
  left: string;
  right: string;
  leftImage?: string | null;
  rightImage?: string | null;
};

export type SubTarget = {
  original: string;
  replacement: string;
  image?: string | null;
};

export type Interaction =
  | { type: "dissertativa"; keywords: string[] }
  | { type: "arrastar_soltar"; bank: string[]; slots: DragSlot[]; instruction?: string; bankLabel?: string }
  | { type: "ligar_colunas"; pairs: Pair[] }
  | { type: "ordenacao"; items: string[]; itemImages?: (string | null)[] }
  | { type: "completar_lacunas"; segments: string[]; answers: string[] }
  | { type: "substituicao"; sentence: string; targets: SubTarget[] }
  | { type: "destacar_trechos"; tokens: string[]; correctIndexes: number[] }
  | { type: "escrita_matematica"; expected: string }
  | { type: "construcao_resposta"; steps: string[]; stepImages?: (string | null)[] };

export type InteractionType = Interaction["type"];

export const SUBJECTIVE_INTERACTION_TYPES: InteractionType[] = [
  "dissertativa",
  "arrastar_soltar",
  "ligar_colunas",
  "ordenacao",
  "completar_lacunas",
  "substituicao",
  "destacar_trechos",
  "escrita_matematica",
  "construcao_resposta",
];

export type SubjectiveQuestionTypeMeta = {
  value: InteractionType;
  label: string;
  description: string;
  icon: string;
};

export const SUBJECTIVE_QUESTION_TYPES: SubjectiveQuestionTypeMeta[] = [
  {
    value: "dissertativa",
    label: "Dissertativa",
    description: "Resposta aberta em texto livre, corrigida manualmente pelo professor.",
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
    description: "Correspondência entre itens de duas colunas.",
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
    description: "Texto com espaços a serem preenchidos.",
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
    value: "escrita_matematica",
    label: "Escrita Matemática",
    description: "Frações, potências, raízes e equações.",
    icon: "Sigma",
  },
  {
    value: "construcao_resposta",
    label: "Construção de Resposta",
    description: "Resposta em etapas: etapa 1 → etapa 2 → conclusão.",
    icon: "Layers",
  },
];

export function getSubjectiveQuestionTypeMeta(type: string | undefined | null): SubjectiveQuestionTypeMeta | undefined {
  return SUBJECTIVE_QUESTION_TYPES.find((meta) => meta.value === type);
}

export function isSubjectiveInteractionType(type: string | undefined | null): type is InteractionType {
  return Boolean(type) && (SUBJECTIVE_INTERACTION_TYPES as string[]).includes(type as string);
}

export function defaultInteraction(type: InteractionType): Interaction {
  switch (type) {
    case "dissertativa":
      return { type, keywords: [] };
    case "arrastar_soltar":
      return {
        type,
        instruction: "",
        bankLabel: "",
        bank: [],
        slots: [{ label: "Lacuna 1", answer: "", images: [] }],
      };
    case "completar_lacunas":
      return {
        type,
        segments: ["", "."],
        answers: [""],
      };
    case "ligar_colunas":
      return {
        type,
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
    case "ordenacao":
      return { type, items: ["Primeiro item", "Segundo item"] };
    case "substituicao":
      return {
        type,
        sentence: "",
        targets: [{ original: "", replacement: "" }],
      };
    case "destacar_trechos":
      return {
        type,
        tokens: [],
        correctIndexes: [],
      };
    case "escrita_matematica":
      return { type, expected: "" };
    case "construcao_resposta":
      return { type, steps: ["Etapa 1"] };
  }
}

/** Garante que o objeto de interação corresponde ao tipo informado, preenchendo com padrão se necessário. */
export function ensureInteraction(type: InteractionType, current?: Interaction | null): Interaction {
  if (current && current.type === type) return current;
  return defaultInteraction(type);
}
