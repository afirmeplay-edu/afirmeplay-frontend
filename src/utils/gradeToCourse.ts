/** Mapeamento série → curso já usado em relatórios e documentos. */
export const GRADE_TO_COURSE: Record<string, string> = {
  "Grupo 3": "Anos Iniciais",
  "Grupo 4": "Anos Iniciais",
  "Grupo 5": "Anos Iniciais",
  "1º Ano": "Anos Iniciais",
  "2º Ano": "Anos Iniciais",
  "3º Ano": "Anos Iniciais",
  "4º Ano": "Anos Iniciais",
  "5º Ano": "Anos Iniciais",
  "6º Ano": "Anos Finais",
  "7º Ano": "Anos Finais",
  "8º Ano": "Anos Finais",
  "9º Ano": "Anos Finais",
  "1º Ano EM": "Ensino Médio",
  "2º Ano EM": "Ensino Médio",
  "3º Ano EM": "Ensino Médio",
};

export const COURSE_OPTIONS = ["Anos Iniciais", "Anos Finais", "Ensino Médio"] as const;

/** Cor de destaque de cada curso/modalidade em documentos impressos (ex.: etiquetas). */
export const COURSE_COLORS = {
  "Educação Infantil": "#DB2777",
  "Anos Iniciais": "#2563EB",
  "Anos Finais": "#16A34A",
  "Ensino Médio": "#7C3AED",
  EJA: "#EA580C",
  "Educação Especial": "#0D9488",
} as const;

export const COURSE_COLOR_DEFAULT = "#475569";

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "o")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function inferCursoFromSerieName(serieName: string): string {
  const raw = (serieName || "").trim();
  if (!raw) return "";
  if (GRADE_TO_COURSE[raw]) return GRADE_TO_COURSE[raw];

  const key = normalizeKey(raw);
  for (const [grade, course] of Object.entries(GRADE_TO_COURSE)) {
    const gradeKey = normalizeKey(grade);
    if (key === gradeKey || key.includes(gradeKey)) return course;
  }

  if (key.includes("ensino medio") || /(^|\s)em(\s|$)/.test(key)) return "Ensino Médio";
  if (key.includes("anos finais") || /\b(6|7|8|9)\b/.test(key)) return "Anos Finais";
  if (key.includes("anos iniciais") || key.includes("grupo") || /\b(1|2|3|4|5)\b/.test(key)) {
    return "Anos Iniciais";
  }
  return "";
}

/** Cor do curso/modalidade pelo nome (tolerante a acentos e variações como "EJA – Ensino Fundamental"). */
export function getCourseColor(courseName: string | null | undefined): string {
  const key = normalizeKey(courseName || "");
  if (!key) return COURSE_COLOR_DEFAULT;
  if (key.includes("infantil") || key.includes("creche") || key.includes("pre-escola")) {
    return COURSE_COLORS["Educação Infantil"];
  }
  if (/\beja\b/.test(key) || key.includes("jovens e adultos")) return COURSE_COLORS.EJA;
  if (key.includes("especial") || /\baee\b/.test(key)) return COURSE_COLORS["Educação Especial"];
  if (key.includes("iniciais")) return COURSE_COLORS["Anos Iniciais"];
  if (key.includes("finais")) return COURSE_COLORS["Anos Finais"];
  if (key.includes("medio")) return COURSE_COLORS["Ensino Médio"];
  return COURSE_COLOR_DEFAULT;
}

export function matchCourseOptionId(
  courseName: string,
  courses: Array<{ id: string; name: string }>
): string {
  const key = normalizeKey(courseName);
  if (!key) return "";
  const exact = courses.find((item) => normalizeKey(item.name) === key);
  if (exact) return exact.id;
  const partial = courses.filter((item) => {
    const name = normalizeKey(item.name);
    return name.includes(key) || key.includes(name);
  });
  return partial.length === 1 ? partial[0].id : "";
}
