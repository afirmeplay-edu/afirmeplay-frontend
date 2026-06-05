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
    /** Valor bruto da API (`class.shift`); preferir `turno` ou helper para exibição. */
    shift?: string;
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

export type EtiquetaTextoLivreAlinhamento = "left" | "center" | "right";

export type EtiquetaEditItem = {
  id: string;
  titulo: string;
  textoLivre: string;
  exibirAssinatura: boolean;
  nomeAplicador: string;
  cpfAplicador: string;
  /** Cor do texto livre (hex) quando assinatura está oculta */
  textoLivreCor: string;
  /** Tamanho da fonte do texto livre (pt no PDF) quando assinatura está oculta */
  textoLivreTamanho: number;
  textoLivreAlinhamento: EtiquetaTextoLivreAlinhamento;
  /** Linha única em negrito acima da assinatura (até 50 caracteres) */
  textoAcimaAssinatura: string;
};
