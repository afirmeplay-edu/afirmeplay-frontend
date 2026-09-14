import type { ProficiencyLevelsAluno } from '@/services/evaluation/proficiencyLevelsApi';
import {
  normalizeProficiencyLevelLabel,
  type ReportProficiencyLabel,
} from '@/utils/report/reportTagStyles';

export type HomogeneousGroup = {
  id: string;
  serie: string;
  nivel: ReportProficiencyLabel;
  alunos: ProficiencyLevelsAluno[];
  mediaPercentual: number | null;
  origens: string[];
};

/**
 * Agrupa alunos por série + nível e fatia em turmas sugeridas de tamanho máximo.
 */
export function buildHomogeneousGroups(
  alunos: ProficiencyLevelsAluno[] | undefined,
  maxPerClass: number
): HomogeneousGroup[] {
  const list = Array.isArray(alunos) ? alunos : [];
  const buckets = new Map<string, ProficiencyLevelsAluno[]>();

  for (const aluno of list) {
    const serie = (aluno.serie || 'Sem série').trim() || 'Sem série';
    const nivel = normalizeProficiencyLevelLabel(aluno.nivel);
    const key = `${serie}||${nivel}`;
    const arr = buckets.get(key) ?? [];
    arr.push(aluno);
    buckets.set(key, arr);
  }

  const groups: HomogeneousGroup[] = [];
  let seq = 0;

  for (const [key, bucket] of buckets) {
    const [serie, nivelRaw] = key.split('||');
    const nivel = normalizeProficiencyLevelLabel(nivelRaw);
    const sorted = [...bucket].sort(
      (a, b) => Number(b.percentual_acertos ?? 0) - Number(a.percentual_acertos ?? 0)
    );

    for (let i = 0; i < sorted.length; i += maxPerClass) {
      const slice = sorted.slice(i, i + maxPerClass);
      const percents = slice
        .map((a) => a.percentual_acertos)
        .filter((v): v is number => v != null && !Number.isNaN(Number(v)));
      const mediaPercentual =
        percents.length > 0
          ? percents.reduce((s, n) => s + Number(n), 0) / percents.length
          : null;
      const origens = Array.from(
        new Set(
          slice.map((a) => {
            const s = (a.serie || serie).trim();
            const t = (a.turma || '').trim();
            return t ? `${s} ${t}` : s;
          })
        )
      ).sort();

      seq += 1;
      groups.push({
        id: `hg-${seq}`,
        serie,
        nivel,
        alunos: slice,
        mediaPercentual,
        origens,
      });
    }
  }

  return groups.sort((a, b) => {
    const s = a.serie.localeCompare(b.serie, 'pt-BR');
    if (s !== 0) return s;
    return a.nivel.localeCompare(b.nivel, 'pt-BR');
  });
}
