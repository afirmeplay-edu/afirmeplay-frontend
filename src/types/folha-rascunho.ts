export type FolhaRascunhoModo = "personalizada" | "avaliacao" | "cartao_resposta";

export type FolhaRascunhoStudent = {
  id: string;
  name: string;
};

export type FolhaRascunhoClass = {
  id: string;
  name: string;
  turno: string;
  students: FolhaRascunhoStudent[];
};

export type FolhaRascunhoSerie = {
  id: string;
  name: string;
  classes: FolhaRascunhoClass[];
};

export type FolhaRascunhoSchool = {
  id: string;
  name: string;
  series: FolhaRascunhoSerie[];
};

export type FolhaRascunhoTotals = {
  schools: number;
  series: number;
  classes: number;
  students: number;
  covers: number;
  pages: number;
};

export type FolhaRascunhoDadosResponse = {
  municipio: {
    id: string;
    name: string;
    state: string;
    prefeitura_label: string;
  };
  ano: number;
  avaliacao_titulo?: string | null;
  modo: FolhaRascunhoModo;
  escolas: FolhaRascunhoSchool[];
  totals: FolhaRascunhoTotals;
};

export type FolhaRascunhoDadosParams = {
  modo: FolhaRascunhoModo;
  estado?: string;
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  evaluation_id?: string;
  answer_sheet_id?: string;
};
