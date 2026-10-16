import {
  COMPARATIVE_NIVEL_LABELS,
  type ComparativeIndicador,
} from '@/constants/comparativeReport';
import { labelResultadosAlunosFiltro } from '@/constants/resultadosAlunosFiltro';
import type { ComparativeResumo } from '@/services/reports/comparativeReportApi';

function sheetName(raw: string): string {
  return raw.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Aba';
}

export async function exportComparativeExcel(report: ComparativeResumo): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const headers = report.avaliacoes.map((a) => a.titulo || a.evaluation_id);
  const selected = new Set(report.filtros_aplicados.indicadores as ComparativeIndicador[]);

  const capa = [
    ['Relatório Comparativo'],
    ['Município', report.filtros_aplicados.municipio.nome],
    ['Alunos', labelResultadosAlunosFiltro(report.filtros_aplicados.alunos)],
    ['Avaliações', headers.join(' | ')],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
    ['Indicadores', report.filtros_aplicados.indicadores.join(', ')],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(capa), sheetName('Capa'));

  if (selected.has('participacao')) {
    const rows = [
      ['Métrica', ...headers],
      ['Esperados', ...report.avaliacoes.map((a) => a.indicadores.participacao?.esperados ?? 0)],
      ['Avaliados', ...report.avaliacoes.map((a) => a.indicadores.participacao?.avaliados ?? 0)],
      [
        '% Comparecimento',
        ...report.avaliacoes.map((a) => a.indicadores.participacao?.percentual_comparecimento ?? 0),
      ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName('Participacao'));
  }

  if (selected.has('proficiencia_media')) {
    const disciplinas = Array.from(
      new Set(
        report.avaliacoes.flatMap((a) =>
          (a.indicadores.proficiencia_media?.por_disciplina || []).map((d) => d.disciplina || '')
        )
      )
    ).filter(Boolean);
    const rows: Array<Array<string | number>> = [
      ['Escopo', ...headers],
      [
        'Geral',
        ...report.avaliacoes.map((a) => Number(a.indicadores.proficiencia_media?.geral ?? 0)),
      ],
    ];
    for (const disciplina of disciplinas) {
      rows.push([
        disciplina,
        ...report.avaliacoes.map((a) => {
          const row = (a.indicadores.proficiencia_media?.por_disciplina || []).find(
            (d) => d.disciplina === disciplina
          );
          return Number(row?.media_proficiencia ?? 0);
        }),
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName('Proficiencia'));
  }

  if (selected.has('distribuicao_niveis')) {
    const rows: Array<Array<string | number>> = [
      ['Nível', ...headers.map((h) => `Qtd — ${h}`), ...headers.map((h) => `% — ${h}`)],
    ];
    for (const nivel of Object.keys(COMPARATIVE_NIVEL_LABELS)) {
      rows.push([
        COMPARATIVE_NIVEL_LABELS[nivel],
        ...report.avaliacoes.map(
          (a) => a.indicadores.distribuicao_niveis?.quantidades?.[nivel] ?? 0
        ),
        ...report.avaliacoes.map(
          (a) => a.indicadores.distribuicao_niveis?.percentuais?.[nivel] ?? 0
        ),
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName('Distribuicao'));
  }

  if (selected.has('alunos_avaliados')) {
    const rows = [
      ['Métrica', ...headers],
      [
        'Alunos avaliados',
        ...report.avaliacoes.map((a) => a.indicadores.alunos_avaliados?.quantidade ?? 0),
      ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName('Avaliados'));
  }

  if (selected.has('aplicacoes')) {
    const rows = [
      ['Métrica', ...headers],
      [
        'Aplicações',
        ...report.avaliacoes.map((a) => a.indicadores.aplicacoes?.quantidade ?? 0),
      ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName('Aplicacoes'));
  }

  const municipio = report.filtros_aplicados.municipio.nome.replace(/\s+/g, '_');
  XLSX.writeFile(wb, `relatorio_comparativo_${municipio}_${Date.now()}.xlsx`);
}
