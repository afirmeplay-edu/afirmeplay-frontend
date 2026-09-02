import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioMapaQuestoes = lazy(() => import('@/pages/reports/RelatorioMapaQuestoes'));

export default function RelatoriosMapaQuestoesHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Mapa de questões"
      titleIcon={ListChecks}
      description="Veja a taxa de acertos e a distribuição de marcações por questão, separados por disciplina, em avaliações online ou cartões-resposta."
      avaliacao={<RelatorioMapaQuestoes flow="digital" hidePageHeading />}
      cartao={<RelatorioMapaQuestoes flow="cartao" hidePageHeading />}
    />
  );
}
