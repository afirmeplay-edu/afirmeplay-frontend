import { lazy } from 'react';
import { Combine } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioUnificado = lazy(() => import('@/pages/reports/RelatorioUnificado'));

export default function RelatoriosUnificadoHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Relatório Unificado"
      titleIcon={Combine}
      description="Junta por aluno os resultados da avaliação (online ou cartão-resposta) com o nível de leitura do Afirme Ler."
      avaliacao={<RelatorioUnificado flow="digital" hidePageHeading />}
      cartao={<RelatorioUnificado flow="cartao" hidePageHeading />}
    />
  );
}
