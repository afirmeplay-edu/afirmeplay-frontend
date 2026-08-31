import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { DualReportEvalCartaoTabs } from '@/pages/reports/DualReportEvalCartaoTabs';

const RelatorioBoletimAluno = lazy(() => import('@/pages/reports/RelatorioBoletimAluno'));

export default function RelatoriosBoletimAlunoHub() {
  return (
    <DualReportEvalCartaoTabs
      defaultTab="avaliacao"
      title="Boletim do aluno"
      titleIcon={ClipboardCheck}
      description="Veja o que cada aluno marcou, o gabarito e os indicadores de acertos, nota, proficiência e nível, em avaliações online ou cartões-resposta."
      avaliacao={<RelatorioBoletimAluno flow="digital" hidePageHeading />}
      cartao={<RelatorioBoletimAluno flow="cartao" hidePageHeading />}
    />
  );
}
