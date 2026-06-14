import type { NovaRespostaAPI } from "@/services/evaluation/evaluationResultsApi";
import type { RelatorioCompleto } from "@/types/evaluation-results";

export type Presentation19Mode = "answer_sheet" | "evaluations";

export type PresentationComparisonAxis = "escola" | "serie" | "turma" | "aluno";

export type SlideQuestionRow = {
  questao: number;
  /** Código/identificador da habilidade (ex.: "D16"). */
  habilidade: string;
  /** Descrição textual da habilidade (quando disponível). */
  habilidadeDescricao?: string;
  percentualAcertos: number;
};

/** Linha de presença: `label` é o rótulo do eixo (escola, série, turma ou turma agregada). */
export type PresenceBySeriesRow = {
  label: string;
  totalAlunos: number;
  totalPresentes: number;
  presencaMediaPct: number;
  alunosFaltosos: number;
  turmaLabel?: string;
};

export type NiveisBySeriesRow = {
  label: string;
  abaixoDoBasico: number;
  basico: number;
  adequado: number;
  avancado: number;
  total: number;
};

export type ProficiencyGeneralByTurmaRow = {
  label: string;
  proficiencia: number;
};

export type ProficiencyByDisciplineByTurmaRow = {
  disciplina: string;
  valuesByTurma: Array<{ turma: string; proficiencia: number }>;
};

export type NotaPorDisciplinaDeck = {
  disciplina: string;
  mediaNota: number;
};

/** Nota média por disciplina e por categoria do eixo (turma/escola/série), para gráficos comparativos. */
export type NotaByDisciplineByTurmaRow = {
  disciplina: string;
  valuesByTurma: Array<{ turma: string; mediaNota: number }>;
};

/** Nota média agregada por categoria (escola/série/turma) para gráficos de comparação. */
export type NotaPorCategoriaDeck = {
  label: string;
  mediaNota: number;
};

export type AlunoPresentationRow = {
  nome: string;
  turma?: string;
  nota: number;
  proficiencia: number;
  classificacao: string;
};

export type Presentation19DeckData = {
  mode: Presentation19Mode;
  /** Eixo usado nos gráficos/tabelas de comparação. */
  comparisonAxis: PresentationComparisonAxis;
  municipioNome: string;
  avaliacaoNome: string;
  escolasParticipantes: string[];

  totalAlunosParticiparam: number;

  /** Slide 4 */
  curso: string;
  serie: string;
  /** Texto exibido no campo Turma(s) da capa (lista separada por vírgula quando há várias). */
  turma: string;
  /** Turno da turma selecionada ou do recorte (exibição apenas). */
  turno?: string;
  /** Turmas distintas que participaram (avaliação/cartão), para layout em lista quando necessário. */
  turmasParticipantesCapa: string[];

  /** Slide 2: com escola selecionada, mostrar série e turmas em vez da lista municipal de escolas. */
  slide2ShowSerieTurmas: boolean;

  /** Escola no filtro sem turma cadastrada: oculta gráficos por disciplina e exibe aviso na seção de notas. */
  schoolMissingRegisteredTurma: boolean;

  /** Slides 5-6 — coluna principal = `label` conforme `comparisonAxis`. */
  presencaPorSerie: PresenceBySeriesRow[];

  /** Slides 9-10 */
  niveisPorSerie: NiveisBySeriesRow[];

  /** Proficiência */
  proficienciaGeralPorTurma: ProficiencyGeneralByTurmaRow[];
  proficienciaPorDisciplinaPorTurma: ProficiencyByDisciplineByTurmaRow[];

  /** Nota por disciplina com barras por categoria do eixo (alinhado a `proficienciaPorDisciplinaPorTurma`). */
  notasPorDisciplinaPorTurma: NotaByDisciplineByTurmaRow[];

  /** Notas (médias agregadas pela API) */
  mediaNotaGeral: number | null;
  notasPorDisciplina: NotaPorDisciplinaDeck[];
  /** Opcional: nota média por categoria (ex.: por escola) para o gráfico de notas. */
  notasPorCategoria: NotaPorCategoriaDeck[];

  /**
   * `media_municipal_por_disciplina` do RelatorioCompleto (mesma fonte que Análise de Avaliações / PDF).
   * A chave `GERAL` é a média municipal consolidada; as demais chaves são por disciplina.
   */
  proficienciaMediaMunicipalPorDisciplinaRelatorio: Record<string, number> | null;
  notaMediaMunicipalPorDisciplinaRelatorio: Record<string, number> | null;
  /** Chaves de `proficiencia.por_disciplina` / `nota_geral.por_disciplina` (excl. GERAL) para lookup municipal. */
  proficienciaDisciplinasRelatorioKeys: string[];
  notaDisciplinasRelatorioKeys: string[];

  /** Legado: mantido vazio (slides de alunos removidos do deck). */
  alunosDetalhados: AlunoPresentationRow[];

  /** Acertos por questão agregados no escopo geral (município/escola conforme relatório). */
  questoesTabelaGeral: SlideQuestionRow[];
  /** Mesma métrica discriminada por turma (a partir da tabela detalhada por aluno). */
  questoesPorTurma: Array<{ turma: string; serieTurma?: string; questoes: SlideQuestionRow[] }>;
  /** Escopo município (`comparisonAxis === "escola"`): por série, sem discriminar turma. */
  questoesPorSerie: Array<{ serie: string; questoes: SlideQuestionRow[] }>;

  /** Slide 8 */
  levelGuide: Array<{
    label: string;
    description: string;
    color: string;
  }>;

  /** Metas/aux */
  primaryColor: string;
  logoDataUrl?: string;
  /** Texto opcional abaixo do título na primeira capa (ex.: secretaria ou rede de ensino). */
  coverSubtitle?: string;
  /** Rodapé em todos os slides (ex.: site, e-mail ou endereço). */
  footerText?: string;
  /** Mensagem do slide final de agradecimento (padrão no builder: "Obrigado!!"). */
  closingMessage?: string;
  /** usado para capas dinâmicas 16-17 */
  serieNomeCapas: string;
  turmaNomeCapas: string;
};

export type BuildDeckDataArgs = {
  mode: Presentation19Mode;
  comparisonAxis: PresentationComparisonAxis;
  /** Quando há escola selecionada no filtro do relatório (id), permite regras específicas de escopo (ex.: questões por turma). */
  selectedSchoolId?: string;
  /** Rótulos para filtrar `por_turma` quando série/turma vierem como id da API. */
  selectedSerieLabel?: string;
  /** Nome da turma selecionada (ex.: rótulo do select de opções). */
  selectedTurmaLabel?: string;
  /** Turno da turma selecionada no filtro (`class.shift`). */
  selectedTurmaShift?: string;
  relatorioDetalhado: Partial<RelatorioCompleto> | null;
  novaRespostaAgregados: NovaRespostaAPI | null;
  /** Quando há turma selecionada, agregados do backend para o recorte "geral da série" (mesmos filtros, sem turma). */
  novaRespostaSerieAgregados?: NovaRespostaAPI | null;
  primaryColor: string;
  logoDataUrl?: string;
  coverSubtitle?: string;
  footerText?: string;
  closingMessage?: string;
};
