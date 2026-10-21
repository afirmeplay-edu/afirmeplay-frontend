import { lazy } from 'react';
import { BarChart3 } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const AnaliseAvaliacoes = lazy(() => import('@/pages/evaluations/AnaliseAvaliacoes'));

export default function RelatoriosAnaliseAvaliacoesHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Análise das avaliações"
      titleIcon={BarChart3}
      description="Análise detalhada de participação, níveis de aprendizagem, proficiência, notas e acertos por habilidade, em avaliações online ou cartões-resposta."
      avaliacao={<AnaliseAvaliacoes flow="digital" hidePageHeading />}
      cartao={<AnaliseAvaliacoes flow="cartao" hidePageHeading />}
    />
  );
}
