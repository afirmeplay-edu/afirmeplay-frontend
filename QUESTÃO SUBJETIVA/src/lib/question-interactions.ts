export type MCOption = { text: string; correct: boolean; image?: string | null };
export type DragSlot = { label: string; answer: string; image?: string | null; images?: string[] };

export function slotImages(s: DragSlot): string[] {
  if (s.images && s.images.length) return s.images;
  if (s.image) return [s.image];
  return [];
}
export type Pair = { left: string; right: string; leftImage?: string | null; rightImage?: string | null };
export type SubTarget = { original: string; replacement: string; image?: string | null };

export type Interaction =
  | { type: "dissertativa"; keywords: string[] }
  | { type: "multipla_escolha"; multi: boolean; options: MCOption[] }
  | { type: "arrastar_soltar"; bank: string[]; slots: DragSlot[]; instruction?: string; bankLabel?: string }
  | { type: "completar_lacunas"; segments: string[]; answers: string[] }
  | { type: "ligar_colunas"; pairs: Pair[] }
  | { type: "ordenacao"; items: string[]; itemImages?: (string | null)[] }
  | { type: "substituicao"; sentence: string; targets: SubTarget[] }
  | { type: "destacar_trechos"; tokens: string[]; correctIndexes: number[] }
  | { type: "escrita_matematica"; expected: string }
  | { type: "construcao_resposta"; steps: string[]; stepImages?: (string | null)[] };

export type InteractionType = Interaction["type"];

export function defaultInteraction(type: InteractionType): Interaction {
  switch (type) {
    case "dissertativa":
      return { type, keywords: ["área", "multiplicação"] };
    case "multipla_escolha":
      return {
        type,
        multi: false,
        options: [
          { text: "Alternativa A", correct: true },
          { text: "Alternativa B", correct: false },
          { text: "Alternativa C", correct: false },
          { text: "Alternativa D", correct: false },
        ],
      };
    case "arrastar_soltar":
      return {
        type,
        instruction: "USE AS LETRAS DO QUADRO PARA COMPLETAR AS PALAVRAS DE ACORDO COM A IMAGEM.",
        bankLabel: "G - F - B - D - C",
        bank: ["G", "F", "B", "D", "C"],
        slots: [
          { label: "___ALANÇO", answer: "B", images: [] },
          { label: "___ORDA", answer: "C", images: [] },
        ],
      };
    case "completar_lacunas":
      return {
        type,
        segments: ["A capital do Brasil é ", "."],
        answers: ["Brasília"],
      };
    case "ligar_colunas":
      return {
        type,
        pairs: [
          { left: "2 + 2", right: "4" },
          { left: "3 × 3", right: "9" },
          { left: "10 ÷ 2", right: "5" },
        ],
      };
    case "ordenacao":
      return { type, items: ["Primeiro", "Segundo", "Terceiro", "Quarto"] };
    case "substituicao":
      return {
        type,
        sentence: "O menino correu depressa até a escola.",
        targets: [
          { original: "depressa", replacement: "rapidamente" },
        ],
      };
    case "destacar_trechos":
      return {
        type,
        tokens: ["A", "casa", "verde", "é", "grande", "e", "bonita"],
        correctIndexes: [2],
      };
    case "escrita_matematica":
      return { type, expected: "648" };
    case "construcao_resposta":
      return { type, steps: ["Identificar dados", "Aplicar fórmula", "Concluir"] };
  }
}

// Student response payloads (always JSON-serializable)
export type Response =
  | { type: "dissertativa"; text: string }
  | { type: "multipla_escolha"; selected: number[] }
  | { type: "arrastar_soltar"; slotValues: (string | null)[] }
  | { type: "completar_lacunas"; values: string[] }
  | { type: "ligar_colunas"; mapping: Record<number, number> } // leftIndex -> rightIndex
  | { type: "ordenacao"; order: number[] }
  | { type: "substituicao"; values: string[] }
  | { type: "destacar_trechos"; selected: number[] }
  | { type: "escrita_matematica"; text: string }
  | { type: "construcao_resposta"; steps: string[] };

export function emptyResponse(interaction: Interaction): Response {
  switch (interaction.type) {
    case "dissertativa":
      return { type: "dissertativa", text: "" };
    case "multipla_escolha":
      return { type: "multipla_escolha", selected: [] };
    case "arrastar_soltar":
      return { type: "arrastar_soltar", slotValues: interaction.slots.map(() => null) };
    case "completar_lacunas":
      return { type: "completar_lacunas", values: interaction.answers.map(() => "") };
    case "ligar_colunas":
      return { type: "ligar_colunas", mapping: {} };
    case "ordenacao":
      return { type: "ordenacao", order: interaction.items.map((_, i) => i) };
    case "substituicao":
      return { type: "substituicao", values: interaction.targets.map(() => "") };
    case "destacar_trechos":
      return { type: "destacar_trechos", selected: [] };
    case "escrita_matematica":
      return { type: "escrita_matematica", text: "" };
    case "construcao_resposta":
      return { type: "construcao_resposta", steps: interaction.steps.map(() => "") };
  }
}

export type GradeResult = {
  correct: number;
  total: number;
  score: number; // 0..10
  details: string;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function gradeInteraction(interaction: Interaction, response: Response): GradeResult {
  if (interaction.type !== response.type) {
    return { correct: 0, total: 1, score: 0, details: "Formato de resposta inválido." };
  }
  switch (interaction.type) {
    case "dissertativa": {
      const text = norm((response as any).text as string);
      const kws = interaction.keywords.map(norm).filter(Boolean);
      const hits = kws.filter((k) => text.includes(k)).length;
      const total = Math.max(1, kws.length);
      const lengthBonus = text.length >= 40 ? 1 : 0;
      const correct = hits;
      const score = Math.min(10, Math.round(((hits / total) * 9 + lengthBonus) * 10) / 10);
      return { correct, total, score, details: `${hits}/${total} palavras-chave presentes.` };
    }
    case "multipla_escolha": {
      const sel = new Set((response as any).selected as number[]);
      const correctIdx = interaction.options
        .map((o, i) => (o.correct ? i : -1))
        .filter((i) => i >= 0);
      const total = correctIdx.length;
      const hits = correctIdx.filter((i) => sel.has(i)).length;
      const wrong = [...sel].filter((i) => !interaction.options[i]?.correct).length;
      const ok = hits === total && wrong === 0;
      return {
        correct: ok ? total : hits,
        total,
        score: ok ? 10 : Math.max(0, Math.round(((hits - wrong) / total) * 100) / 10),
        details: ok ? "Alternativa(s) correta(s)." : "Marcação incorreta.",
      };
    }
    case "arrastar_soltar": {
      const vals = (response as any).slotValues as (string | null)[];
      const total = interaction.slots.length;
      const hits = interaction.slots.filter((s, i) => norm(vals[i] ?? "") === norm(s.answer)).length;
      return { correct: hits, total, score: Math.round((hits / total) * 100) / 10, details: `${hits}/${total} lacunas corretas.` };
    }
    case "completar_lacunas": {
      const vals = (response as any).values as string[];
      const total = interaction.answers.length;
      const hits = interaction.answers.filter((a, i) => norm(a) === norm(vals[i] ?? "")).length;
      return { correct: hits, total, score: Math.round((hits / total) * 100) / 10, details: `${hits}/${total} lacunas.` };
    }
    case "ligar_colunas": {
      const map = (response as any).mapping as Record<number, number>;
      const total = interaction.pairs.length;
      // correct pair: leftIndex -> same rightIndex (pairs preserved by order)
      const hits = interaction.pairs.filter((_, i) => map[i] === i).length;
      return { correct: hits, total, score: Math.round((hits / total) * 100) / 10, details: `${hits}/${total} pares.` };
    }
    case "ordenacao": {
      const order = (response as any).order as number[];
      const total = interaction.items.length;
      const hits = order.filter((v, i) => v === i).length;
      return { correct: hits, total, score: Math.round((hits / total) * 100) / 10, details: `${hits}/${total} posições.` };
    }
    case "substituicao": {
      const vals = (response as any).values as string[];
      const total = interaction.targets.length;
      const hits = interaction.targets.filter((t, i) => norm(vals[i] ?? "") === norm(t.replacement)).length;
      return { correct: hits, total, score: Math.round((hits / total) * 100) / 10, details: `${hits}/${total} substituições.` };
    }
    case "destacar_trechos": {
      const sel = new Set((response as any).selected as number[]);
      const correctSet = new Set(interaction.correctIndexes);
      const total = correctSet.size || 1;
      let hits = 0;
      correctSet.forEach((i) => sel.has(i) && hits++);
      const wrong = [...sel].filter((i) => !correctSet.has(i)).length;
      const raw = Math.max(0, hits - wrong);
      return { correct: hits, total, score: Math.round((raw / total) * 100) / 10, details: `${hits}/${total} trechos.` };
    }
    case "escrita_matematica": {
      const t = norm((response as any).text);
      const ok = t === norm(interaction.expected);
      return { correct: ok ? 1 : 0, total: 1, score: ok ? 10 : 0, details: ok ? "Correto." : `Esperado: ${interaction.expected}` };
    }
    case "construcao_resposta": {
      const steps = (response as any).steps as string[];
      const total = interaction.steps.length;
      const filled = steps.filter((s) => (s ?? "").trim().length >= 3).length;
      return { correct: filled, total, score: Math.round((filled / total) * 100) / 10, details: `${filled}/${total} etapas preenchidas.` };
    }
  }
}

export function proficiencyLevel(score: number): "Abaixo do básico" | "Básico" | "Adequado" | "Avançado" {
  if (score >= 9) return "Avançado";
  if (score >= 7) return "Adequado";
  if (score >= 5) return "Básico";
  return "Abaixo do básico";
}
