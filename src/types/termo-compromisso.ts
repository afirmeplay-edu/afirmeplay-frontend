export type TermoCompromissoModo = "manual" | "avaliacao" | "cartao_resposta";

export type TermoCompromissoDadosParams = {
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  modo?: TermoCompromissoModo;
  evaluation_id?: string;
  answer_sheet_id?: string;
};

export type TermoCompromissoDadosResponse = {
  municipio: {
    id: string;
    name: string;
    state: string;
    prefeitura_label: string;
    secretaria_label: string;
  };
  contexto: {
    escola: string;
    serie: string;
    turma: string;
    /** Turno da turma (API pode enviar `shift` ou `turno`). */
    turno?: string;
    shift?: string;
    /** Nome do mês da avaliação em português (ex.: "junho") */
    mes_avaliacao: string;
    ano: number;
    /** Município no corpo do termo (ex.: "Limoeiro de Anadia/AL") */
    municipio_corpo: string;
    /** Texto completo do período (ex.: "no período de junho de 2026") */
    periodo_texto: string;
    /** Título da avaliação/cartão quando modo avaliação ou cartão-resposta */
    nome_aplicacao_referencia: string;
    /** Data formatada no rodapé (ex.: "Limoeiro de Anadia, 15 de junho de 2026") */
    data_documento: string;
  };
  documento: {
    titulo: string;
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
  /** Nome da avaliação/aplicação exibido no corpo do termo */
  nomeAplicacao: string;
};
