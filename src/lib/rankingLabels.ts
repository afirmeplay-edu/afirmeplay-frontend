/** Mesmo formato do backend: "Série - Turma" ou só a série. */
export function formatGradeClassLabel(gradeName?: unknown, className?: unknown): string {
  const grade = String(gradeName ?? "").trim() || "Sem série";
  const turma = String(className ?? "").trim();
  if (turma) return `${grade} - ${turma}`;
  return grade;
}

type BestClassRow = {
  best_class_name?: string;
  best_class_grade?: string;
  best_class_serie?: string;
  best_class_turma?: string;
};

export function formatBestClassDisplay(row: BestClassRow): string {
  const formatted = String(row.best_class_name ?? "").trim();
  if (formatted.includes(" - ")) return formatted;

  const grade = String(row.best_class_grade ?? row.best_class_serie ?? "").trim();
  const turma = String(row.best_class_turma ?? formatted).trim();
  if (grade || turma) return formatGradeClassLabel(grade || "Sem série", turma);

  return formatted || "N/A";
}
