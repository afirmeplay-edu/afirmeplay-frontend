import React, { useState } from 'react';
import { CheckCircle2, Target, Gauge, Award, Users, Coins } from 'lucide-react';
import { QuestionData, VisibleFields } from '../../../types/results-table';

/** Tooltip da coluna de habilidade: evita exibir só "?" quando a API manda placeholder. */
function skillColumnTooltipTitle(habilidade: string | undefined, codigo: string | undefined): string {
  const h = (habilidade ?? '').trim();
  const c = (codigo ?? '').trim();
  const primary = h || c;
  if (!primary) return '';
  if (/^[\?\uFF1F]$/.test(primary) || primary === '—' || primary === '-') {
    return c && !/^[\?\uFF1F]$/.test(c) && c !== '—' && c !== '-' ? c : '';
  }
  return primary;
}

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

interface TableHeaderProps {
  totalQuestions: number;
  startQuestionNumber: number;
  questoes?: QuestionData[];
  visibleFields: VisibleFields;
  // ✅ NOVO: Dados da tabela_detalhada
  tabelaDetalhada?: {
    disciplinas: TabelaDetalhadaDisciplina[];
  };
  /** Visão geral: uma coluna Nota/Prof./Nível por disciplina (+ bloco Geral). */
  disciplineSummaryNames?: string[];
  students?: Array<{
    id: string;
    nome: string;
    acertos: number;
    erros: number;
    em_branco: number;
    respostas?: Array<{
      questao_id: string;
      questao_numero: number;
      resposta_correta: boolean;
      resposta_em_branco: boolean;
      tempo_gasto: number;
    }>;
    [key: string]: any;
  }>;
  successThreshold?: number;
  showCoins?: boolean; // Mostrar coluna de moedas (para competições)
}

export const TableHeader: React.FC<TableHeaderProps> = ({
  totalQuestions,
  startQuestionNumber,
  questoes,
  visibleFields,
  tabelaDetalhada,
  students = [],
  successThreshold = 60,
  showCoins = false,
  disciplineSummaryNames = [],
}) => {
  const summaryDisciplines = disciplineSummaryNames.filter((n) => n.trim().length > 0);
  const useDisciplineSummary = summaryDisciplines.length > 0;

  const shortDisciplineLabel = (name: string) => {
    const n = name.trim();
    const lower = n.toLowerCase();
    if (lower.includes('portugu')) return 'Port.';
    if (lower.includes('matem')) return 'Mat.';
    if (n.length <= 10) return n;
    return `${n.slice(0, 9)}…`;
  };
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  // ✅ NOVO: Processar questões da tabela_detalhada
  const processQuestionsFromTabelaDetalhada = () => {
    if (!tabelaDetalhada?.disciplinas?.length) {
      return [];
    }

    const allQuestions: Array<{
      numero: number;
      habilidade: string;
      codigo_habilidade: string;
      question_id: string;
      disciplina: string;
      disciplina_id: string;
    }> = [];

    // Coletar todas as questões de todas as disciplinas
    tabelaDetalhada.disciplinas.forEach((disciplina, disciplinaIndex) => {
      disciplina.questoes.forEach((questao, questaoIndex) => {
        
        allQuestions.push({
          numero: questao.numero,
          habilidade: questao.habilidade,
          codigo_habilidade: questao.codigo_habilidade,
          question_id: questao.question_id,
          disciplina: disciplina.nome,
          disciplina_id: disciplina.id
        });
      });
    });

    // Ordenar por número da questão
    const sortedQuestions = allQuestions.sort((a, b) => a.numero - b.numero);

    return sortedQuestions;
  };

  const processedQuestions = processQuestionsFromTabelaDetalhada();

  // Função para calcular estatísticas de uma questão
  const getQuestionStats = (questionNumber: number) => {
    if (!students.length) return { correct: 0, total: 0, percentage: 0 };

    let correct = 0;
    let total = 0;

    students.forEach(student => {
      if (student.respostas) {
        const response = student.respostas.find(r => r.questao_numero === questionNumber);
        if (response && !response.resposta_em_branco) {
          total++;
          if (response.resposta_correta) {
            correct++;
          }
        }
      }
    });
    
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, total, percentage };
  };

  // Função para obter cor baseada na porcentagem de acertos
  const getPercentageColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30';
    if (percentage >= 60) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30';
    if (percentage >= 40) return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30';
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
  };

  // Função para obter cor baseada no threshold
  const getThresholdColor = (percentage: number) => {
    return percentage >= successThreshold ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  return (
    <thead>
      {/* Cabeçalho simplificado - uma única linha */}
      <tr className="bg-gradient-to-r from-gray-100 dark:from-gray-800 to-gray-200 dark:to-gray-700 border-b-2 border-border">
        <th className="border border-border p-2 text-center font-semibold text-foreground">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              ALUNO
            </div>
            {visibleFields.percentualAluno && (
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">% ALUNO</div>
            )}
            {visibleFields.habilidade && (
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">HABILIDADE</div>
            )}
            {visibleFields.percentualTurma && (
              <div className="text-xs text-green-600 dark:text-green-400 font-medium">% DA TURMA</div>
            )}
          </div>
        </th>
        {processedQuestions.map((questao, index) => (
          <th
            key={`${questao.disciplina_id}-${questao.question_id}-${index}`}
            className="border border-border p-1 text-center font-semibold hover:bg-muted transition-colors"
          >
            <div className="text-xs font-bold text-foreground">Q{questao.numero}</div>
            <div className="text-xs text-muted-foreground mt-1">{questao.disciplina}</div>
            {visibleFields.habilidade && (
              <div 
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-help hover:bg-blue-100 dark:hover:bg-blue-950/30 rounded px-1 py-0.5 transition-colors mt-1" 
                title={skillColumnTooltipTitle(questao.habilidade, questao.codigo_habilidade)}
                onMouseEnter={() => setHoveredSkill(questao.habilidade)}
                onMouseLeave={() => setHoveredSkill(null)}
              >
                {questao.codigo_habilidade}
              </div>
            )}
            {visibleFields.percentualTurma && (
              <div className="mt-1">
                {(() => {
                  const stats = getQuestionStats(questao.numero);
                  return (
                    <div className={`text-xs font-semibold px-2 py-1 rounded ${getPercentageColor(stats.percentage)}`}>
                      {stats.percentage}%
                    </div>
                  );
                })()}
              </div>
            )}
          </th>
        ))}
        <th className="border border-border p-2 text-center font-semibold text-foreground">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            TOTAL
          </div>
        </th>
        {useDisciplineSummary ? (
          <>
            {summaryDisciplines.flatMap((nome) => {
              const short = shortDisciplineLabel(nome);
              return [
                <th
                  key={`${nome}-nota`}
                  className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-muted/40"
                >
                  <div>Nota</div>
                  <div className="text-muted-foreground font-normal">{short}</div>
                </th>,
                <th
                  key={`${nome}-prof`}
                  className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-muted/40"
                >
                  <div>Prof.</div>
                  <div className="text-muted-foreground font-normal">{short}</div>
                </th>,
                <th
                  key={`${nome}-nivel`}
                  className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-muted/40"
                >
                  <div>Nível</div>
                  <div className="text-muted-foreground font-normal">{short}</div>
                </th>,
              ];
            })}
            <th className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-purple-50/80 dark:bg-purple-950/30">
              <div>Nota</div>
              <div className="text-muted-foreground font-normal">Geral</div>
            </th>
            <th className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-purple-50/80 dark:bg-purple-950/30">
              <div>Prof.</div>
              <div className="text-muted-foreground font-normal">Geral</div>
            </th>
            <th className="border border-border p-1.5 text-center text-[11px] font-semibold text-foreground bg-purple-50/80 dark:bg-purple-950/30">
              <div>Nível</div>
              <div className="text-muted-foreground font-normal">Geral</div>
            </th>
          </>
        ) : (
          <>
            <th className="border border-border p-2 text-center font-semibold text-foreground">
              <div className="flex items-center justify-center gap-1">
                <Target className="h-4 w-4" />
                NOTA
              </div>
            </th>
            <th className="border border-border p-2 text-center font-semibold text-foreground">
              <div className="flex items-center justify-center gap-1">
                <Gauge className="h-4 w-4" />
                PROFICIÊNCIA
              </div>
            </th>
            <th className="border border-border p-2 text-center font-semibold text-foreground">
              <div className="flex items-center justify-center gap-1">
                <Award className="h-4 w-4" />
                NÍVEL
              </div>
            </th>
          </>
        )}
        {showCoins && (
          <th className="border border-border p-2 text-center font-semibold text-foreground">
            <div className="flex items-center justify-center gap-1">
              <Coins className="h-4 w-4 text-yellow-500" />
              MOEDAS
            </div>
          </th>
        )}
      </tr>
    </thead>
  );
};