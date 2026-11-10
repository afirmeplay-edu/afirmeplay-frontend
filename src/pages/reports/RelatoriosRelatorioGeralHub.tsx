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
      description="Consolide avaliações ou cartões resposta em um único relatório."
      avaliacao={<RelatorioGeral flow="digital" hidePageHeading />}
      cartao={<RelatorioGeral flow="cartao" hidePageHeading />}
    />
  );
}
