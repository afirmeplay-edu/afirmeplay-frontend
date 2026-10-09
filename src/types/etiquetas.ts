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

export type EtiquetaAplicadorExtra = {
  textoAcima: string;
  nome: string;
  cpf: string;
};

export type EtiquetaEditItem = {
  id: string;
  titulo: string;
  textoLivre: string;
  exibirAssinatura: boolean;
  nomeAplicador: string;
  cpfAplicador: string;
  /** Exibe um segundo bloco de aplicador (nome + CPF) na etiqueta. */
  exibirSegundoAplicador: boolean;
  nomeAplicador2: string;
  cpfAplicador2: string;
  /** Cor do texto livre (hex) quando assinatura está oculta */
  textoLivreCor: string;
  /** Tamanho da fonte do texto livre (pt no PDF) quando assinatura está oculta */
  textoLivreTamanho: number;
  textoLivreAlinhamento: EtiquetaTextoLivreAlinhamento;
  /** Linha única em negrito acima da assinatura (até 50 caracteres) */
  textoAcimaAssinatura: string;
  /** Linha única em negrito acima da assinatura do 2º aplicador (até 50 caracteres) */
  textoAcimaAssinatura2: string;
  /** Aplicadores a partir do 3º (exigem o 2º aplicador ativo). */
  aplicadoresExtras?: EtiquetaAplicadorExtra[];
  /** Turma de origem das etiquetas geradas automaticamente a partir dos filtros. */
  turmaId?: string;
  /** Cabeçalho editável das etiquetas personalizadas (sem turma de origem). */
  contextoPersonalizado?: EtiquetasDadosResponse["contexto"];
};
