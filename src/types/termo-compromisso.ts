export type TermoCompromissoModo = "manual" | "avaliacao" | "cartao_resposta";

/** Organização do download: PDF único, ZIP com um PDF por escola ou ZIP com um PDF por escola/série. */
export type TermoCompromissoExportFormat = "pdf_unico" | "zip_escola" | "zip_serie";

export type TermoCompromissoLoteParams = {
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  modo?: TermoCompromissoModo;
  evaluation_id?: string;
  answer_sheet_id?: string;
};

export type TermoCompromissoMunicipio = {
  id: string;
  name: string;
  state: string;
  prefeitura_label: string;
  secretaria_label: string;
};

/** Dados do termo que não variam por turma. */
export type TermoCompromissoContextoComum = {
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

export type TermoCompromissoTurma = {
  turma_id: string;
  turma: string;
  /** Turno da turma */
  shift: string;
  escola_id: string;
  escola: string;
  serie_id: string;
  serie: string;
};

export type TermoCompromissoLoteResponse = {
  municipio: TermoCompromissoMunicipio;
  contexto: TermoCompromissoContextoComum;
  documento: {
    titulo: string;
  };
  filters: {
    municipio: string;
    escola: string;
    serie: string;
    turma: string;
  };
  turmas: TermoCompromissoTurma[];
};
