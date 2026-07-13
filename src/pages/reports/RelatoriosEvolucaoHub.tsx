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
      description="Compare múltiplas avaliações ou gabaritos corrigidos e acompanhe a evolução dos resultados ao longo do tempo — inclusive por aluno."
      avaliacao={<Evolution hidePageHeading />}
      cartao={<EvolutionCartaoResposta hidePageHeading />}
      aluno={<EvolutionPorAluno />}
    />
  );
}
