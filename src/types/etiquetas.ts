export type EtiquetasModo = "manual" | "avaliacao" | "cartao_resposta";

export type EtiquetasDadosParams = {
  modo: EtiquetasModo;
  municipio: string;
  escola?: string;
  nivel?: string;
  serie?: string;
  turma?: string;
  turno?: string;
  evaluation_id?: string;
  answer_sheet_id?: string;
};

export type EtiquetasDadosResponse = {
  municipio: {
    id: string;
    name: string;
    state: string;
    prefeitura_label: string;
  };
  contexto: {
    escola: string;
    nivel: string;
    serie: string;
    turma: string;
    turno: string;
    ano: number;
  };
  modo: EtiquetasModo;
  title_reference?: string | null;
  filters: {
    modo: EtiquetasModo;
    municipio: string;
    escola: string;
    nivel: string;
    serie: string;
    turma: string;
    turno: string;
    evaluation_id: string;
    answer_sheet_id: string;
  };
};

export type EtiquetaEditItem = {
  id: string;
  titulo: string;
  textoLivre: string;
  exibirAssinatura: boolean;
  nomeAplicador: string;
  cpfAplicador: string;
};
