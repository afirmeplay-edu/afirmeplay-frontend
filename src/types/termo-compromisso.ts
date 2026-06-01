export type TermoCompromissoDadosParams = {
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
};

export type TermoCompromissoDadosResponse = {
  municipio: {
    id: string;
    name: string;
    state: string;
    prefeitura_label: string;
  };
  contexto: {
    escola: string;
    serie: string;
    turma: string;
    turno: string;
    ano: number;
  };
  filters: {
    municipio: string;
    escola: string;
    serie: string;
    turma: string;
  };
};

export type TermoCompromissoFormData = {
  nome: string;
  cpf: string;
  rg: string;
};
