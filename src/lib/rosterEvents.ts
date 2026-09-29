/** Disparado quando o cadastro ou a presença de alunos muda e a frequência precisa ser relida. */
export const ROSTER_CHANGED_EVENT = "afirme:roster-changed";

const MUTATING = new Set(["post", "put", "patch", "delete"]);

export function notifyRosterChanged(): void {
  window.dispatchEvent(new Event(ROSTER_CHANGED_EVENT));
}

/** Mutações que alteram quem está na lista ou o status P/A/T. */
export function requestAffectsRoster(method: string, url: string): boolean {
  if (!MUTATING.has(method.toLowerCase())) return false;
  const path = url.split("?")[0];
  if (/conquistas|password-report|\/grades\//.test(path)) return false;
  return (
    /\/students(\/|$)/.test(path) ||
    /\/remove_student/.test(path) ||
    /\/add_student/.test(path) ||
    /transferir-turma/.test(path) ||
    /bulk-upload-students/.test(path) ||
    /\/presenca/.test(path) ||
    /student-answers/.test(path) ||
    /answer-sheets/.test(path)
  );
}
