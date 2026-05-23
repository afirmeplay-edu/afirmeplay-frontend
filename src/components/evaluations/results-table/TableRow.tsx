import React from 'react';
import { Eye, Check, X, Minus, Coins } from 'lucide-react';
import { StudentResult, VisibleFields, type DisciplineMetricCell } from '../../../types/results-table';
import { getReportProficiencyTagClass } from '@/utils/report/reportTagStyles';
import { ContextMenu } from '../../ui/context-menu';
import { formatCoins } from '@/utils/coins';
import { Badge } from '@/components/ui/badge';

// Interface para questões da tabela_detalhada
interface TabelaDetalhadaQuestao {
  numero: number;
  habilidade: string;
  codigo_habilidade: string;
  question_id: string;
}

interface TabelaDetalhadaDisciplina {
  id: string;
  nome: string;
  questoes: TabelaDetalhadaQuestao[];
}

interface TableRowProps {
  student: StudentResult;
  studentIndex: number;
  totalQuestions: number;
  visibleFields: VisibleFields;
  onViewStudentDetails: (studentId: string) => void;
  detailedReport?: any;
  evaluationId?: string;
  // ✅ NOVO: Dados da tabela_detalhada para mapear respostas corretas
  tabelaDetalhada?: {
    disciplinas: TabelaDetalhadaDisciplina[];
  };
  // ✅ NOVO: Função para abrir em nova guia
  onOpenInNewTab?: (studentId: string) => void;
  // ✅ NOVO: Mostrar coluna de moedas (para competições)
  showCoins?: boolean;
  /** Visão geral: métricas por disciplina + geral (substitui nota/prof/nível únicos). */
  disciplineMetrics?: DisciplineMetricCell[];
  geralMetrics?: { nota: number; proficiencia: number; nivel: string };
}

export const TableRow: React.FC<TableRowProps> = ({
  student,
  studentIndex,
  totalQuestions,
  visibleFields,
  onViewStudentDetails,
  detailedReport,
  evaluationId,
  tabelaDetalhada,
  onOpenInNewTab,
  showCoins = false,
  disciplineMetrics,
  geralMetrics,
}) => {
  const useDisciplineSummary = Boolean(disciplineMetrics?.length);
  
  // ✅ NOVO: Processar respostas reais da tabela_detalhada
  const processStudentAnswers = React.useMemo(() => {
    if (!tabelaDetalhada?.disciplinas?.length || !student.respostas) {
      return {};
    }

    const answersMap: Record<number, { respondeu: boolean; acertou: boolean }> = {};

    // Mapear respostas do aluno por número da questão
    student.respostas.forEach(resposta => {
      answersMap[resposta.questao_numero] = {
        respondeu: !resposta.resposta_em_branco,
        acertou: resposta.resposta_correta
      };
    });

    return answersMap;
  }, [tabelaDetalhada, student.respostas]);

  // ✅ NOVO: Obter todas as questões ordenadas
  const allQuestions = React.useMemo(() => {
    if (!tabelaDetalhada?.disciplinas?.length) {
      return [];
    }

    const questions: Array<{
      numero: number;
      habilidade: string;
      codigo_habilidade: string;
      question_id: string;
      disciplina: string;
    }> = [];

    tabelaDetalhada.disciplinas.forEach((disciplina, disciplinaIndex) => {
      disciplina.questoes.forEach((questao, questaoIndex) => {
        
        questions.push({
          numero: questao.numero,
          habilidade: questao.habilidade,
          codigo_habilidade: questao.codigo_habilidade,
          question_id: questao.question_id,
          disciplina: disciplina.nome
        });
      });
    });

    const sortedQuestions = questions.sort((a, b) => a.numero - b.numero);

    return sortedQuestions;
  }, [tabelaDetalhada, student.nome]);

  return (
    <tr 
      className="border-b hover:bg-muted cursor-pointer group border-border"
      onClick={() => onViewStudentDetails(student.id)}
      title="Clique para ver resultados detalhados do aluno"
    >
      {/* Nome do Aluno */}
      <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap border border-border">
        <ContextMenu
          onViewDetails={() => onViewStudentDetails(student.id)}
          onOpenInNewTab={() => onOpenInNewTab?.(student.id)}
          studentName={student.nome}
        >
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={(e) => {
              // ✅ NOVO: Clique esquerdo navega para página detalhada
              if (e.button === 0 || e.type === 'click') {
                e.stopPropagation(); // Evitar que o evento borbulhe para a linha
                onViewStudentDetails(student.id);
              }
            }}
          >
            <span className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{student.nome}</span>
            <Eye className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {visibleFields.percentualAluno && (
            <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              {(() => {
                const total =
                  (student.acertos ?? 0) + (student.erros ?? 0) + (student.em_branco ?? 0);
                if (total <= 0) return '0%';
                const pct = ((student.acertos ?? 0) / total) * 100;
                return `${pct.toFixed(1)}%`;
              })()}
            </div>
          )}
        </ContextMenu>
      </td>

      {/* Questões individuais */}
      {allQuestions.map((questao, index) => {
        const answer = processStudentAnswers[questao.numero];
        const questionDisplayNumber = questao.numero; // ✅ CORRIGIDO: Usar o número real da questão
        const uniqueKey = `${student.id}-${questao.disciplina}-q${questao.numero}-${questao.question_id}-${index}`;
        
        return (
          <td key={uniqueKey} className="px-2 py-3 text-center border border-border">
            {answer ? (
              // Aluno respondeu
              answer.acertou ? (
                <Check className="w-4 h-4 text-green-700 dark:text-green-400 mx-auto" title={`Q${questionDisplayNumber} - ${questao.disciplina}: Acertou`} />
              ) : (
                <X className="w-4 h-4 text-red-600 dark:text-red-400 mx-auto" title={`Q${questionDisplayNumber} - ${questao.disciplina}: Errou`} />
              )
            ) : (
              // Aluno não respondeu
              <Minus className="w-4 h-4 text-muted-foreground mx-auto" title={`Q${questionDisplayNumber} - ${questao.disciplina}: Não respondeu`} />
            )}
          </td>
        );
      })}

      {/* Total de acertos */}
      <td className="px-4 py-3 text-sm font-semibold text-center border border-border text-foreground">
        {student.acertos}
      </td>

      {useDisciplineSummary ? (
        <>
          {disciplineMetrics!.map((dm) => (
            <React.Fragment key={`dm-${dm.disciplina}`}>
              <td className="px-2 py-3 text-sm text-center border border-border text-foreground tabular-nums">
                {Number(dm.nota ?? 0).toFixed(1)}
              </td>
              <td className="px-2 py-3 text-sm text-center border border-border text-foreground tabular-nums">
                {Number(dm.proficiencia ?? 0).toFixed(1)}
              </td>
              <td className="px-2 py-3 text-sm text-center border border-border">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${getReportProficiencyTagClass(dm.nivel)}`}
                >
                  {dm.nivel?.trim() || '—'}
                </span>
              </td>
            </React.Fragment>
          ))}
          <td className="px-2 py-3 text-sm text-center border border-border text-foreground font-medium tabular-nums bg-purple-50/50 dark:bg-purple-950/20">
            {Number(geralMetrics?.nota ?? student.nota ?? 0).toFixed(1)}
          </td>
          <td className="px-2 py-3 text-sm text-center border border-border text-foreground font-medium tabular-nums bg-purple-50/50 dark:bg-purple-950/20">
            {Number(geralMetrics?.proficiencia ?? student.proficiencia ?? 0).toFixed(1)}
          </td>
          <td className="px-2 py-3 text-sm text-center border border-border bg-purple-50/50 dark:bg-purple-950/20">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${getReportProficiencyTagClass(
                geralMetrics?.nivel ?? student.classificacao
              )}`}
            >
              {(geralMetrics?.nivel ?? student.classificacao)?.trim() || '—'}
            </span>
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3 text-sm text-center border border-border text-foreground">
            {student.nota.toFixed(1)}
          </td>
          <td className="px-4 py-3 text-sm text-center border border-border text-foreground">
            {Number(student.proficiencia || 0).toFixed(1)}
          </td>
          <td className="px-4 py-3 text-sm font-medium text-center border border-border">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-white ${
                student.classificacao === 'Avançado'
                  ? 'bg-green-600 dark:bg-green-700'
                  : student.classificacao === 'Adequado'
                  ? 'bg-green-400 dark:bg-green-600'
                  : student.classificacao === 'Básico'
                  ? 'bg-yellow-500 dark:bg-yellow-600'
                  : student.classificacao === 'Abaixo do Básico'
                  ? 'bg-red-500 dark:bg-red-600'
                  : 'bg-red-500 dark:bg-red-600'
              }`}
            >
              {student.classificacao || 'Abaixo do Básico'}
            </span>
          </td>
        </>
      )}
      {showCoins && (
        <td className="border border-border p-2 text-center">
          {student.moedas_ganhas !== undefined && student.moedas_ganhas > 0 ? (
            <Badge className="bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-400 border-yellow-300">
              <Coins className="w-3 h-3 mr-1" />
              {formatCoins(student.moedas_ganhas)}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </td>
      )}
    </tr>
  );
}; 