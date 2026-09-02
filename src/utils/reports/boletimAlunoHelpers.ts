import type { BoletimAlunoQuestao } from '@/types/boletim-aluno';

export type BoletimMarkStatus = 'correct' | 'wrong' | 'empty';

export function questionAlternativeLetters(questoes: BoletimAlunoQuestao[] | undefined): string[] {
  const letters: string[] = [];
  for (const q of questoes ?? []) {
    if (q.gabarito && /^[A-E]$/i.test(q.gabarito)) letters.push(q.gabarito.toUpperCase());
    if (q.resposta && /^[A-E]$/i.test(q.resposta)) letters.push(q.resposta.toUpperCase());
  }
  const lastCode = Math.max('D'.charCodeAt(0), ...letters.map((letter) => letter.charCodeAt(0)));
  const out: string[] = [];
  for (let code = 65; code <= lastCode && code <= 69; code++) {
    out.push(String.fromCharCode(code));
  }
  return out;
}

export function getBoletimMarkStatus(questao: BoletimAlunoQuestao, letter: string): BoletimMarkStatus {
  if (!questao.respondeu || !questao.resposta) return 'empty';
  if (questao.resposta.toUpperCase() !== letter.toUpperCase()) return 'empty';
  return questao.acertou ? 'correct' : 'wrong';
}

export function alunoPickerLabel(aluno: {
  nome: string;
  serie?: string;
  turma?: string;
  matricula?: string;
}): string {
  const parts = [aluno.nome];
  const extra = [aluno.serie, aluno.turma].filter(Boolean).join(' · ');
  if (extra) parts.push(extra);
  return parts.join(' — ');
}
