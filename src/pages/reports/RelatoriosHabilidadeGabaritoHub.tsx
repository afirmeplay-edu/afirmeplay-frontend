import { lazy } from 'react';
import { BookMarked } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioHabilidadeGabarito = lazy(() => import('@/pages/reports/RelatorioHabilidadeGabarito'));

export default function RelatoriosHabilidadeGabaritoHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Relatório de habilidade e gabarito"
      titleIcon={BookMarked}
      description="Veja a habilidade e o gabarito de cada questão. Várias avaliações aparecem em blocos separados; as que não foram aplicadas no recorte ficam de fora."
      avaliacao={<RelatorioHabilidadeGabarito flow="digital" hidePageHeading />}
      cartao={<RelatorioHabilidadeGabarito flow="cartao" hidePageHeading />}
    />
  );
}
