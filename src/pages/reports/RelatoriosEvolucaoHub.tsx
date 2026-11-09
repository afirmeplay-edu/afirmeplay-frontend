import { lazy } from 'react';
import { TrendingUp } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const Evolution = lazy(() => import('@/pages/reports/Evolution'));
const EvolutionCartaoResposta = lazy(() => import('@/pages/reports/EvolutionCartaoResposta'));
const EvolutionPorAluno = lazy(() => import('@/pages/reports/EvolutionPorAluno'));

export default function RelatoriosEvolucaoHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Análise de Evolução"
      titleIcon={TrendingUp}
      description="Compare avaliações ou gabaritos e acompanhe a evolução dos resultados."
      avaliacao={<Evolution hidePageHeading />}
      cartao={<EvolutionCartaoResposta hidePageHeading />}
      aluno={<EvolutionPorAluno />}
      grupos={<Evolution hidePageHeading includeGroupsTab />}
      gruposTabLabel="Escola · Série · Turma"
    />
  );
}
