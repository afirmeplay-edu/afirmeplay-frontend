/**
 * Mapeamento href → código de feature do plano do município (backend).
 * Itens sem entrada não são filtrados por plano (compatível com módulos legados).
 */
const HREF_FEATURE_EXACT: Record<string, string> = {
  '/app': 'dashboard',
  '/aluno': 'dashboard',
  '/app/agenda': 'calendar',
  '/aluno/agenda': 'calendar',
  '/app/avaliacoes': 'evaluations',
  '/aluno/avaliacoes': 'evaluations',
  '/app/resultados': 'evaluation_results',
  '/aluno/resultados': 'evaluation_results',
  '/app/questionario': 'socioeconomic_forms',
  '/aluno/questionario': 'socioeconomic_forms',
  '/app/jogos': 'games',
  '/aluno/jogos': 'games',
  '/app/play-tv': 'play_tv',
  '/aluno/play-tv': 'play_tv',
  '/app/plantao': 'plantao_online',
  '/aluno/plantao-online': 'plantao_online',
  '/app/cadastros/gestao': 'schools',
  '/app/cadastros/questao': 'questions',
  '/app/cartao-resposta/cadastrar': 'answer_sheet',
  '/app/cartao-resposta/gerar': 'answer_sheet',
  '/app/cartao-resposta/corrigir': 'answer_sheet',
  '/app/lista-frequencia': 'lista_frequencia',
  '/app/documentos/ata-sala': 'saved_ata',
  '/app/documentos/folha-rascunho': 'folha_rascunho',
  '/app/calculadora-saeb': 'ideb_meta',
  '/app/calculo-metas': 'ideb_meta',
  '/app/evolucao': 'reports',
  '/app/monitoramento': 'monitoring',
  '/app/questionarios/cadastro': 'socioeconomic_forms',
  '/app/questionarios/relatorios-socio-economicos': 'socioeconomic_forms',
  '/app/questionarios/resultados-socioeconomicos': 'socioeconomic_forms',
  '/app/questionarios/inse-avaliacao': 'socioeconomic_forms',
  '/app/questionarios/pneerq': 'socioeconomic_forms',
  '/app/relatorios/acerto-niveis': 'reports',
  '/app/relatorios/mapa-habilidades': 'reports',
  '/app/relatorios/analise-avaliacoes': 'report_analysis',
  '/app/relatorios/relatorio-escolar': 'reports',
  '/app/relatorios/relatorio-geral': 'reports',
  '/app/relatorios/relatorio-apresentacao-19-slides': 'reports',
  '/app/relatorios/ranking': 'ranking',
  '/app/certificados': 'certificates',
  '/aluno/certificados': 'certificates',
  '/app/olimpiadas': 'competitions',
  '/aluno/olimpiadas': 'competitions',
  '/app/competitions': 'competitions',
  '/aluno/competitions': 'competitions',
  '/app/moedas': 'balance',
  '/aluno/moedas/historico': 'balance',
  '/app/loja/gerenciar': 'store',
  '/aluno/loja': 'store',
};

const HREF_FEATURE_PREFIX: Array<[string, string]> = [
  ['/app/cartao-resposta', 'answer_sheet'],
  ['/app/avaliacao/', 'evaluations'],
  ['/app/provas-fisicas/', 'physical_tests'],
  ['/app/jogos/', 'games'],
  ['/app/play-tv/', 'play_tv'],
  ['/app/competitions/', 'competitions'],
  ['/aluno/competitions/', 'competitions'],
  ['/app/loja/', 'store'],
];

export function resolveFeatureForHref(href?: string): string | undefined {
  if (!href) return undefined;
  const normalized = href.split('?')[0].replace(/\/+$/, '') || '/';
  const exact = HREF_FEATURE_EXACT[normalized];
  if (exact) return exact;
  for (const [prefix, feature] of HREF_FEATURE_PREFIX) {
    if (normalized.startsWith(prefix)) return feature;
  }
  return undefined;
}
