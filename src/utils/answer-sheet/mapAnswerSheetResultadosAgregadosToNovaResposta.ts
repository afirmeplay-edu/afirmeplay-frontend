import type { NovaRespostaAPI, RankingItem } from "@/services/evaluation/evaluationResultsApi";

/** Resposta de GET /answer-sheets/resultados-agregados (mesma forma que `AnswerSheetResults.tsx`). */
export interface AnswerSheetResultadosAgregadosRaw {
  nivel_granularidade?: string;
  filtros_aplicados?: Record<string, string>;
  estatisticas_gerais?: {
    tipo?: string;
    nome?: string;
    estado?: string;
    municipio?: string;
    escola?: string;
    serie?: string;
    total_escolas?: number;
    total_series?: number;
    total_turmas?: number;
    total_gabaritos?: number;
    total_alunos?: number;
    alunos_participantes?: number;
    alunos_pendentes?: number;
    alunos_ausentes?: number;
    alunos_pendentes_detalhe?: Array<{
      id: string;
      nome: string;
      escola?: string;
      serie?: string;
      turma?: string;
    }>;
    percentual_comparecimento?: number;
    nivel_classificacao?: string | null;
    media_nota_geral?: number;
    media_proficiencia_geral?: number;
    distribuicao_classificacao_geral?: {
      abaixo_do_basico?: number;
      basico?: number;
      adequado?: number;
      avancado?: number;
    };
    total_avaliacoes?: number;
    /** Quando o backend envia; senão o mapper preenche uma linha `GERAL`. */
    por_disciplina?: Array<{
      disciplina: string;
      total_avaliacoes?: number;
      total_alunos?: number;
      alunos_participantes?: number;
      alunos_pendentes?: number;
      alunos_ausentes?: number;
      media_nota?: number;
      media_proficiencia?: number;
      distribuicao_classificacao?: Record<string, number>;
    }>;
  };
  resultados_por_disciplina?: Array<{
    disciplina: string;
    total_avaliacoes?: number;
    total_alunos?: number;
    alunos_participantes?: number;
    media_nota?: number;
    media_proficiencia?: number;
    distribuicao_classificacao?: {
      abaixo_do_basico?: number;
      basico?: number;
      adequado?: number;
      avancado?: number;
    };
  }>;
  resultados_detalhados?: {
    gabaritos?: Array<{
      id: string;
      titulo: string;
      serie?: string;
      turma?: string;
      escola?: string;
      escola_id?: string;
      municipio?: string;
      estado?: string;
      total_alunos?: number;
      alunos_participantes?: number;
      alunos_pendentes?: number;
      alunos_ausentes?: number;
      percentual_comparecimento?: number;
      media_nota?: number;
      media_proficiencia?: number;
      media_nota_lingua_portuguesa?: number | null;
      media_nota_matematica?: number | null;
      medias_por_disciplina?: Array<{
        disciplina: string;
        media_nota?: number;
        media_proficiencia?: number;
      }>;
      distribuicao_classificacao?: {
        abaixo_do_basico?: number;
        basico?: number;
        adequado?: number;
        avancado?: number;
      };
      nivel_classificacao?: string | null;
    }>;
    paginacao?: { page: number; per_page: number; total: number; total_pages: number };
  };
  tabela_detalhada?: {
    disciplinas?: Array<{
      id: string;
      nome: string;
      questoes?: Array<{
        numero: number;
        habilidade?: string;
        codigo_habilidade?: string;
        question_id?: string;
      }>;
      alunos?: Array<{
        id: string;
        nome: string;
        escola?: string;
        serie?: string;
        turma?: string;
        respostas_por_questao?: Array<{
          questao: number;
          acertou: boolean;
          respondeu: boolean;
          resposta: string;
        }>;
        total_acertos: number;
        total_erros: number;
        total_respondidas: number;
        total_questoes_disciplina: number;
        nivel_proficiencia: string;
        nota: number;
        proficiencia: number;
        status?: string;
      }>;
    }>;
    geral?: {
      alunos?: Array<{
        id: string;
        nome: string;
        escola?: string;
        serie?: string;
        turma?: string;
        nota_geral: number;
        proficiencia_geral: number;
        nivel_proficiencia_geral: string;
        total_acertos_geral: number;
        total_questoes_geral: number;
        total_respondidas_geral: number;
        total_em_branco_geral?: number;
        percentual_acertos_geral: number;
        status_geral: string;
        respostas_por_questao?: Array<{
          questao: number;
          acertou: boolean;
          respondeu: boolean;
          resposta: string;
        }>;
      }>;
    };
  };
  ranking?: Array<{
    posicao: number;
    student_id?: string;
    aluno_id?: string;
    nome: string;
    escola?: string;
    serie?: string;
    turma?: string;
    grade?: number;
    nota_geral?: number;
    proficiency?: number;
    proficiencia_geral?: number;
    classification?: string;
    classificacao_geral?: string;
    total_acertos?: number;
    total_questoes?: number;
  }>;
  opcoes_proximos_filtros?: {
    gabaritos?: Array<{ id: string; titulo?: string; nome?: string; name?: string }>;
    escolas?: Array<{ id: string; nome?: string; name?: string }>;
    series?: Array<{ id: string; nome?: string; name?: string }>;
    turmas?: Array<{ id: string; nome?: string; name?: string }>;
  };
  analise_ia_status?: 'processing' | 'ready' | 'error';
  analise_ia_cache_key?: string;
  analise_ia?: Record<string, unknown>;
}

const emptyDist = () => ({
  abaixo_do_basico: 0,
  basico: 0,
  adequado: 0,
  avancado: 0,
});

const isGranularity = (v: string): v is NovaRespostaAPI["nivel_granularidade"] =>
  v === "municipio" || v === "escola" || v === "serie" || v === "turma" || v === "avaliacao";

/**
 * Converte a resposta de `/answer-sheets/resultados-agregados` para o formato usado pelo Relatório Escolar.
 */
export function mapAnswerSheetResultadosAgregadosToNovaResposta(
  raw: AnswerSheetResultadosAgregadosRaw,
  filters: {
    estado: string;
    municipio: string;
    gabarito: string;
    escola: string;
    serie: string;
    turma: string;
  }
): NovaRespostaAPI {
  const eg = raw.estatisticas_gerais ?? {};
  const tipoRaw = (raw.nivel_granularidade ?? eg.tipo ?? "municipio").toLowerCase();
  const nivelGranularidade: NovaRespostaAPI["nivel_granularidade"] = isGranularity(tipoRaw)
    ? tipoRaw
    : "municipio";
  const coercedStatsTipo = (eg.tipo ?? tipoRaw).toLowerCase();
  const statsTipo: NovaRespostaAPI["estatisticas_gerais"]["tipo"] = isGranularity(coercedStatsTipo)
    ? coercedStatsTipo
    : nivelGranularidade;

  const distGeral = { ...emptyDist(), ...eg.distribuicao_classificacao_geral };

  const porDisciplinaFromBackend = eg.por_disciplina;
  const porDisciplinaStats =
    Array.isArray(porDisciplinaFromBackend) && porDisciplinaFromBackend.length > 0
      ? porDisciplinaFromBackend.map((row) => ({
          disciplina: String(row.disciplina ?? "GERAL"),
          total_avaliacoes: row.total_avaliacoes ?? eg.total_avaliacoes ?? 1,
          total_alunos: row.total_alunos ?? eg.total_alunos ?? 0,
          alunos_participantes: row.alunos_participantes ?? eg.alunos_participantes ?? 0,
          alunos_pendentes: row.alunos_pendentes ?? eg.alunos_pendentes ?? 0,
          alunos_ausentes: row.alunos_ausentes ?? eg.alunos_ausentes ?? 0,
          media_nota: row.media_nota ?? eg.media_nota_geral ?? 0,
          media_proficiencia: row.media_proficiencia ?? eg.media_proficiencia_geral ?? 0,
          distribuicao_classificacao: {
            ...distGeral,
            ...(row.distribuicao_classificacao ?? {}),
          } as Record<string, number>,
        }))
      : [
          {
            disciplina: "GERAL",
            total_avaliacoes: eg.total_avaliacoes ?? 1,
            total_alunos: eg.total_alunos ?? 0,
            alunos_participantes: eg.alunos_participantes ?? 0,
            alunos_pendentes: eg.alunos_pendentes ?? 0,
            alunos_ausentes: eg.alunos_ausentes ?? 0,
            media_nota: eg.media_nota_geral ?? 0,
            media_proficiencia: eg.media_proficiencia_geral ?? 0,
            distribuicao_classificacao: { ...distGeral } as Record<string, number>,
          },
        ];

  const resultadosPorDisciplina = (raw.resultados_por_disciplina ?? []).map((d) => ({
    disciplina: d.disciplina,
    total_avaliacoes: d.total_avaliacoes ?? 1,
    total_alunos: d.total_alunos ?? eg.total_alunos ?? 0,
    alunos_participantes: d.alunos_participantes ?? eg.alunos_participantes ?? 0,
    alunos_pendentes: 0,
    alunos_ausentes: eg.alunos_ausentes ?? 0,
    media_nota: d.media_nota ?? 0,
    media_proficiencia: d.media_proficiencia ?? 0,
    distribuicao_classificacao: { ...emptyDist(), ...d.distribuicao_classificacao },
  }));

  const disciplinas = (raw.tabela_detalhada?.disciplinas ?? []).map((disc) => ({
    id: disc.id,
    nome: disc.nome,
    questoes: (disc.questoes ?? []).map((q) => ({
      numero: q.numero,
      habilidade: q.habilidade ?? "",
      codigo_habilidade: q.codigo_habilidade ?? "",
      question_id: q.question_id ?? "",
    })),
    alunos: (disc.alunos ?? []).map((a) => ({
      id: a.id,
      nome: a.nome,
      escola: a.escola ?? "",
      serie: a.serie ?? "",
      turma: a.turma ?? "",
      respostas_por_questao: (a.respostas_por_questao ?? []).map((r) => ({
        questao: r.questao,
        acertou: r.acertou,
        respondeu: r.respondeu,
        resposta: r.resposta,
      })),
      total_acertos: a.total_acertos,
      total_erros: a.total_erros,
      total_respondidas: a.total_respondidas,
      total_questoes_disciplina: a.total_questoes_disciplina,
      nivel_proficiencia: a.nivel_proficiencia,
      nota: a.nota,
      proficiencia: a.proficiencia,
    })),
  }));

  const geralAlunos = (raw.tabela_detalhada?.geral?.alunos ?? []).map((a) => ({
    id: a.id,
    nome: a.nome,
    escola: a.escola,
    serie: a.serie,
    turma: a.turma,
    nota_geral: a.nota_geral,
    proficiencia_geral: a.proficiencia_geral,
    nivel_proficiencia_geral: a.nivel_proficiencia_geral,
    total_acertos_geral: a.total_acertos_geral,
    total_questoes_geral: a.total_questoes_geral,
    total_respondidas_geral: a.total_respondidas_geral,
    total_em_branco_geral: a.total_em_branco_geral,
    percentual_acertos_geral: a.percentual_acertos_geral,
    status_geral: a.status_geral,
    respostas_por_questao: a.respostas_por_questao,
  }));

  const gabaritos = raw.resultados_detalhados?.gabaritos ?? [];

  const avaliacoesFromGabaritos = gabaritos.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    disciplina: "",
    serie: g.serie,
    turma: g.turma,
    escola: g.escola,
    escola_id: g.escola_id,
    municipio: g.municipio,
    estado: g.estado,
    data_aplicacao: "",
    status: "finalized" as const,
    total_alunos: g.total_alunos ?? 0,
    alunos_participantes: g.alunos_participantes ?? 0,
    alunos_pendentes: g.alunos_pendentes ?? 0,
    alunos_ausentes: g.alunos_ausentes ?? 0,
    percentual_comparecimento: g.percentual_comparecimento,
    media_nota: g.media_nota ?? 0,
    media_proficiencia: g.media_proficiencia ?? 0,
    media_nota_lingua_portuguesa: g.media_nota_lingua_portuguesa,
    media_nota_matematica: g.media_nota_matematica,
    medias_por_disciplina: g.medias_por_disciplina,
    distribuicao_classificacao: { ...emptyDist(), ...g.distribuicao_classificacao },
    nivel_classificacao: g.nivel_classificacao,
  }));

  const avaliacoesLinhas = avaliacoesFromGabaritos;

  const ranking: RankingItem[] = (raw.ranking ?? []).map((r) => ({
    posicao: r.posicao,
    aluno_id: r.student_id ?? r.aluno_id ?? "",
    nome: r.nome,
    escola: r.escola ?? "",
    serie: r.serie ?? "",
    turma: r.turma ?? "",
    nota_geral: r.grade ?? r.nota_geral ?? 0,
    proficiencia_geral: r.proficiency ?? r.proficiencia_geral ?? 0,
    classificacao_geral: r.classification ?? r.classificacao_geral ?? "",
    total_acertos: r.total_acertos ?? 0,
    total_questoes: r.total_questoes ?? 0,
  }));

  const tituloGabarito =
    gabaritos.find((g) => g.id === filters.gabarito)?.titulo ?? eg.nome ?? "Cartão resposta";

  const out: NovaRespostaAPI = {
    nivel_granularidade: nivelGranularidade,
    filtros_aplicados: {
      estado: filters.estado,
      municipio: filters.municipio,
      escola: filters.escola === "all" ? null : filters.escola,
      serie: filters.serie === "all" ? null : filters.serie,
      turma: filters.turma === "all" ? null : filters.turma,
      avaliacao: filters.gabarito,
    },
    estatisticas_gerais: {
      tipo: statsTipo,
      nome: eg.nome ?? tituloGabarito,
      estado: eg.estado ?? filters.estado,
      municipio: eg.municipio,
      escola: eg.escola,
      serie: eg.serie,
      total_escolas: eg.total_escolas,
      total_series: eg.total_series,
      total_turmas: eg.total_turmas,
      total_gabaritos: eg.total_gabaritos,
      total_avaliacoes: eg.total_avaliacoes ?? Math.max(1, avaliacoesLinhas.length),
      total_alunos: eg.total_alunos ?? 0,
      alunos_participantes: eg.alunos_participantes ?? 0,
      alunos_pendentes: eg.alunos_pendentes ?? 0,
      alunos_ausentes: eg.alunos_ausentes ?? 0,
      alunos_pendentes_detalhe: eg.alunos_pendentes_detalhe,
      percentual_comparecimento: eg.percentual_comparecimento,
      nivel_classificacao: eg.nivel_classificacao ?? null,
      media_nota_geral: eg.media_nota_geral ?? 0,
      media_proficiencia_geral: eg.media_proficiencia_geral ?? 0,
      distribuicao_classificacao_geral: distGeral,
      por_disciplina: porDisciplinaStats,
    },
    resultados_por_disciplina: resultadosPorDisciplina,
    resultados_detalhados: {
      avaliacoes: avaliacoesLinhas,
      paginacao: raw.resultados_detalhados?.paginacao ?? {
        page: 1,
        per_page: 100,
        total: avaliacoesLinhas.length,
        total_pages: 1,
      },
    },
    tabela_detalhada:
      disciplinas.length > 0 || geralAlunos.length > 0
        ? {
            disciplinas,
            geral: geralAlunos.length ? { alunos: geralAlunos } : undefined,
          }
        : undefined,
    ranking: ranking.length ? ranking : undefined,
    opcoes_proximos_filtros: {
      avaliacoes:
        raw.opcoes_proximos_filtros?.gabaritos?.map((g) => ({
          id: g.id,
          titulo: g.titulo ?? g.nome ?? g.name ?? "Gabarito",
        })) ?? [{ id: filters.gabarito, titulo: tituloGabarito }],
      escolas:
        raw.opcoes_proximos_filtros?.escolas?.map((e) => ({
          id: e.id,
          name: e.name ?? e.nome ?? "",
        })) ?? [],
      series:
        raw.opcoes_proximos_filtros?.series?.map((s) => ({
          id: s.id,
          name: s.name ?? s.nome ?? "",
        })) ?? [],
      turmas:
        raw.opcoes_proximos_filtros?.turmas?.map((t) => ({
          id: t.id,
          name: t.name ?? t.nome ?? "",
        })) ?? [],
    },
    analise_ia_status: raw.analise_ia_status,
    analise_ia_cache_key: raw.analise_ia_cache_key,
    analise_ia: raw.analise_ia,
  };

  return out;
}
