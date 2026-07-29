import { lazy } from 'react';
import { UserCheck } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioParticipacao = lazy(() => import('@/pages/reports/RelatorioParticipacao'));

export default function RelatoriosParticipacaoHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Relatório de Participação"
      titleIcon={UserCheck}
      description="Acompanhe matriculados, avaliados e o percentual de participação por escola e turma, em avaliações online ou cartões resposta."
      avaliacao={<RelatorioParticipacao flow="digital" hidePageHeading />}
      cartao={<RelatorioParticipacao flow="cartao" hidePageHeading />}
    />
  );
}
