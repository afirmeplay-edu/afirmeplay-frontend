import { lazy } from 'react';
import { Layers } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioGeral = lazy(() => import('@/pages/reports/RelatorioGeral'));

export default function RelatoriosRelatorioGeralHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Relatório Geral"
      titleIcon={Layers}
      description="Consolide múltiplas avaliações ou cartões resposta do município em um único relatório com frequência, médias, habilidades e distribuição de níveis."
      avaliacao={<RelatorioGeral flow="digital" hidePageHeading />}
      cartao={<RelatorioGeral flow="cartao" hidePageHeading />}
    />
  );
}
