export type RelatorioUnificadoReportFlow = 'digital' | 'cartao';

export type RelatorioUnificadoFilterEntity = {
  id: string;
  nome: string;
};

export type RelatorioUnificadoFilterAvaliacao = RelatorioUnificadoFilterEntity & {
  titulo?: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type RelatorioUnificadoFilterTurma = RelatorioUnificadoFilterEntity & {
  shift?: string;
  label?: string;
};

export type RelatorioUnificadoLeituraAvaliacao = {
  id: string;
  titulo: string;
  ano?: number | null;
  edicao?: string;
  edicaoLabel?: string;
  status?: string;
};

export type RelatorioUnificadoOpcoesFiltros = {
  estados: RelatorioUnificadoFilterEntity[];
  municipios: RelatorioUnificadoFilterEntity[];
  avaliacoes: RelatorioUnificadoFilterAvaliacao[];
  escolas: RelatorioUnificadoFilterEntity[];
  series: RelatorioUnificadoFilterEntity[];
  turmas: RelatorioUnificadoFilterTurma[];
  leitura: {
    anos: number[];
    edicoes: RelatorioUnificadoFilterEntity[];
    avaliacoes: RelatorioUnificadoLeituraAvaliacao[];
  };
};

export type RelatorioUnificadoOpcoesFiltrosParams = {
  report_entity_type?: 'answer_sheet';
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turma?: string;
};

export type RelatorioUnificadoMetricas = {
  proficiencia: number | null;
  nota: number | null;
  classificacao: string | null;
};

export type RelatorioUnificadoAluno = {
  id: string;
  nome: string;
  turmaId: string | null;
  turmaNome: string;
  escolaId: string | null;
  porDisciplina: Record<string, RelatorioUnificadoMetricas>;
  geral: RelatorioUnificadoMetricas;
  nivelLeitura: string | null;
  nivelLeituraLabel: string | null;
  alfabetizado: boolean | null;
  semProva: boolean;
  semLeitura: boolean;
};

export type RelatorioUnificadoDados = {
  metadados: {
    rotuloCombinado: string;
    estado: string;
    municipioId: string;
    municipioNome: string;
    avaliacao: {
      id: string;
      titulo: string;
      reportEntityType: string;
    };
    leitura: {
      id: string;
      titulo: string;
      ano?: number | null;
      edicao?: string;
      edicaoLabel?: string;
    };
    escopo: {
      escolas: string[];
      series: string[];
      turmas: string[];
    };
  };
  disciplinas: Array<{ id: string; nome: string }>;
  resumo: {
    totalAlunos: number;
    alunosComLeitura: number;
    alunosLf: number;
    icaPctLf: number;
    alunosSemLeitura: number;
  };
  alunos: RelatorioUnificadoAluno[];
};

export type RelatorioUnificadoDadosParams = {
  estado: string;
  municipio: string;
  avaliacao: string;
  avaliacao_leitura: string;
  report_entity_type?: 'answer_sheet';
  escola?: string;
  serie?: string;
  turma?: string;
};
