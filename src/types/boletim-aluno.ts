export type BoletimAlunoFilterEntity = {
  id: string;
  nome: string;
};

export type BoletimAlunoFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type BoletimAlunoFilterTurma = {
  id: string;
  nome: string;
  shift?: string;
  label: string;
};

export type BoletimAlunoFilterAluno = {
  id: string;
  nome: string;
  matricula?: string;
  escola?: string;
  serie?: string;
  turma?: string;
};

export type BoletimAlunoPaginacao = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

export type BoletimAlunoReportFlow = 'digital' | 'cartao';

export type BoletimAlunoOpcoesFiltros = {
  estados: BoletimAlunoFilterEntity[];
  municipios?: BoletimAlunoFilterEntity[];
  avaliacoes?: BoletimAlunoFilterAvaliacao[];
  gabaritos?: BoletimAlunoFilterAvaliacao[];
  escolas?: BoletimAlunoFilterEntity[];
  series?: BoletimAlunoFilterEntity[];
  turmas?: BoletimAlunoFilterTurma[];
  alunos?: BoletimAlunoFilterAluno[];
  alunos_paginacao?: BoletimAlunoPaginacao;
};

export type BoletimAlunoOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nome?: string;
  page?: number;
  per_page?: number;
  report_entity_type?: 'answer_sheet';
};

export type BoletimAlunoResumoParams = {
  estado: string;
  municipio: string;
  avaliacao: string;
  aluno?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nome?: string;
  q?: string;
  page?: number;
  per_page?: number;
  report_entity_type?: 'answer_sheet';
};

export type BoletimAlunoQuestao = {
  numero: number;
  habilidade?: string;
  resposta: string | null;
  gabarito: string;
  acertou: boolean;
  respondeu: boolean;
};

export type BoletimAlunoPorDisciplina = {
  disciplina_id: string;
  disciplina: string;
  questoes: BoletimAlunoQuestao[];
};

export type BoletimAlunoCards = {
  acertos_totais: {
    acertou: number;
    total: number;
    percentual: number;
  };
  nota: number;
  proficiencia: number;
  nivel: string;
};

export type BoletimAlunoItem = {
  aluno: BoletimAlunoFilterAluno;
  por_disciplina: BoletimAlunoPorDisciplina[];
  cards: BoletimAlunoCards;
};

export type BoletimAlunoResumo = {
  escopo: {
    estado: string;
    municipio_id: string;
    avaliacao_id: string;
    escolas: string[];
    series: string[];
    turmas: string[];
    aluno_id: string | null;
    report_entity_type?: 'answer_sheet';
  };
  avaliacao: {
    id: string;
    nome: string;
  };
  paginacao: BoletimAlunoPaginacao;
  boletins: BoletimAlunoItem[];
};
