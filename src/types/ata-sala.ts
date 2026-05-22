export type AtaModoLista = "turma" | "avaliacao" | "cartao_resposta";

export type AtaOptions = {
  applicationDayLabel: string;
  dateDay: string;
  dateMonth: string;
  dateYear: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  didNotOccurReason: string;
  occurrenceA: boolean;
  occurrenceB: boolean;
  occurrenceC: boolean;
  occurrenceD: boolean;
  occurrenceE: boolean;
  occurrenceDetail5: string;
  noOccurrences: boolean;
  occurrenceDetail6: string;
  q7Responded: string;
  q8NotResponded: string;
  q9Tablets: string;
  q10SpecialStayed: string;
  q11SpecialRegularRoom: string;
  q12SpecialSupportRoom: string;
  assinaturaAplicador: string;
  cpfAplicador: string;
  assinaturaApoioRegular: string;
  cpfApoioRegular: string;
  assinaturaApoioSuporte: string;
  cpfApoioSuporte: string;
};

export type AtaSalaPdfData = {
  nomeAvaliacao: string;
  cursoLabel: string;
  municipioUf: string;
  rede: string;
  escola: string;
  serieTurma: string;
  turno: string;
  disciplina: string;
  options: AtaOptions;
};

export type AtaSalaFiltersPayload = {
  modo_lista: AtaModoLista;
  estado_id: string;
  municipio_id: string;
  escola_id: string;
  serie_id: string;
  turma_id: string | null;
  avaliacao_id: string | null;
};

export type AtaSalaSavePayload = {
  title: string;
  filters: AtaSalaFiltersPayload;
  content: AtaSalaPdfData;
};

export type SavedAtaSummary = {
  id: string;
  title: string;
  created_by_name: string;
  created_by_user_id: string;
  escola: string;
  serie_turma: string;
  disciplina: string;
  modo_lista: AtaModoLista;
  school_id: string;
  city_id: string;
  updated_at: string | null;
  created_at: string | null;
  is_owner: boolean;
};

export type SavedAtaDetail = SavedAtaSummary & {
  filters: AtaSalaFiltersPayload;
  content: AtaSalaPdfData;
};

export type SavedAtaListResponse = {
  items: SavedAtaSummary[];
  page: number;
  per_page: number;
  total: number;
  pages: number;
};
