import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Button } from "@/components/ui/button";
import { Check, X, Minus, Eye, CheckCircle2, Target, Gauge, Award, ChevronLeft, ChevronRight, MoreHorizontal, Coins } from "lucide-react";
import { formatCoins } from "@/utils/coins";
import { TableHeader } from '../results-table/TableHeader';
import { TableRow } from '../results-table/TableRow';
import { TableLegend } from '../results-table/TableLegend';
import { getSubjectColors } from '@/utils/competition/competitionSubjectColors';
import { normalizeProficiencyLevelLabel } from '@/utils/report/reportTagStyles';
import type { DisciplineMetricCell } from '@/types/results-table';

function isNomeDisciplinaGeral(nome: string): boolean {
  const n = nome.trim().toLowerCase();
  return n === 'geral' || n === 'total' || n === 'consolidado';
}

interface TabelaDetalhadaQuestao {
  numero: number;
  habilidade: string;
  codigo_habilidade: string;
  question_id: string;
}

interface TabelaDetalhadaAluno {
  id: string;
  nome: string;
  escola: string;
  serie: string;
  turma: string;
  respostas_por_questao: Array<{
    questao: number;
    acertou: boolean;
    respondeu: boolean;
    resposta: string;
  }>;
  total_acertos: number;
  total_erros: number;
  total_respondidas: number;
  total_questoes_disciplina: number;
  nivel_proficiencia: string;
  nota: number;
  proficiencia: number;
  moedas_ganhas?: number; // Opcional para competições
}

interface TabelaDetalhadaDisciplina {
  id: string;
  nome: string;
  questoes: TabelaDetalhadaQuestao[];
  alunos: TabelaDetalhadaAluno[];
}

interface TabelaDetalhadaGeralAluno {
  id: string;
  nome: string;
  escola: string;
  serie: string;
  turma: string;
  nota_geral: number;
  proficiencia_geral: number;
  nivel_proficiencia_geral: string;
  total_acertos_geral: number;
  total_questoes_geral: number;
  total_respondidas_geral: number;
  total_em_branco_geral: number;
  percentual_acertos_geral: number;
  status_geral: string;
  moedas_ganhas?: number; // Opcional para competições
}

interface QuestaoConsolidada extends TabelaDetalhadaQuestao {
  disciplina: string;
}

interface DisciplineTablesProps {
  tabelaDetalhada: {
    disciplinas: TabelaDetalhadaDisciplina[];
    geral?: {
      alunos: TabelaDetalhadaGeralAluno[];
    };
  };
  onViewStudentDetails?: (studentId: string) => void;
  // ✅ NOVO: Função para abrir em nova guia
  onOpenInNewTab?: (studentId: string) => void;
  // ✅ NOVO: Mostrar coluna de moedas (para competições)
  showCoins?: boolean;
}

export const DisciplineTables: React.FC<DisciplineTablesProps> = ({
  tabelaDetalhada,
  onViewStudentDetails,
  onOpenInNewTab,
  showCoins = false
}) => {
  // ✅ NOVO: Estado para gerenciar visualização de muitas questões
  const [currentQuestionWindow, setCurrentQuestionWindow] = useState(0);
  const [currentDisciplineWindow, setCurrentDisciplineWindow] = useState<{[key: string]: number}>({});
  
  // ✅ NOVO: Configurações para visualização otimizada
  const QUESTIONS_PER_WINDOW = 15; // Mostrar 15 questões por vez
  const MAX_QUESTIONS_FOR_FULL_VIEW = 25; // Acima disso, usar visualização em janelas

  // ✅ NOVO: Funções para gerenciar visualização em janelas
  const getQuestionWindow = (questions: QuestaoConsolidada[] | TabelaDetalhadaQuestao[], windowIndex: number) => {
    const start = windowIndex * QUESTIONS_PER_WINDOW;
    const end = start + QUESTIONS_PER_WINDOW;
    return questions.slice(start, end);
  };

  const getTotalWindows = (totalQuestions: number) => {
    return Math.ceil(totalQuestions / QUESTIONS_PER_WINDOW);
  };

  const getCurrentWindowForDiscipline = (disciplinaId: string) => {
    return currentDisciplineWindow[disciplinaId] || 0;
  };

  const setCurrentWindowForDiscipline = (disciplinaId: string, windowIndex: number) => {
    setCurrentDisciplineWindow(prev => ({
      ...prev,
      [disciplinaId]: windowIndex
    }));
  };

  // Função para calcular estatísticas de uma questão
  const getQuestionStats = (disciplina: TabelaDetalhadaDisciplina, questaoNumero: number) => {
    if (!disciplina.alunos.length) return { correct: 0, total: 0, percentage: 0 };

    let correct = 0;
    let total = 0;

    disciplina.alunos.forEach(aluno => {
      const resposta = aluno.respostas_por_questao.find(r => r.questao === questaoNumero);
      if (resposta && resposta.respondeu) {
        total++;
        if (resposta.acertou) {
          correct++;
        }
      }
    });
    
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, total, percentage };
  };

  // Função para obter cor do nível
  const getLevelColor = (classificacao: string) => {
    switch (classificacao) {
      case 'Avançado': return 'bg-green-600';
      case 'Adequado': return 'bg-green-400';
      case 'Básico': return 'bg-yellow-500';
      case 'Abaixo do Básico': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // ✅ NOVO: Consolidar todas as questões de todas as disciplinas (com memoização para performance)
  const getAllQuestions = useMemo(() => {
    const allQuestions: QuestaoConsolidada[] = [];

    tabelaDetalhada.disciplinas.forEach((disciplina, disciplinaIndex) => {
      disciplina.questoes.forEach((questao, questaoIndex) => {
        allQuestions.push({
          numero: questao.numero,
          habilidade: questao.habilidade,
          codigo_habilidade: questao.codigo_habilidade,
          question_id: questao.question_id,
          disciplina: disciplina.nome
        });
      });
    });

    const sortedQuestions = allQuestions.sort((a, b) => a.numero - b.numero);

    return sortedQuestions;
  }, [tabelaDetalhada.disciplinas]);

  // ✅ NOVO: Consolidar dados dos alunos de todas as disciplinas (com memoização para performance)
  const getConsolidatedStudents = useMemo(() => {
    if (!tabelaDetalhada.disciplinas.length) return [];

    // Pegar alunos da primeira disciplina como base (todos devem ter os mesmos alunos)
    const baseStudents = tabelaDetalhada.disciplinas[0].alunos;
    
    // ✅ CORRIGIDO: Filtrar apenas alunos que responderam pelo menos uma questão
    const studentsWithAnswers = baseStudents.filter(aluno => {
      // Verificar se o aluno respondeu pelo menos uma questão em qualquer disciplina
      return tabelaDetalhada.disciplinas.some(disciplina => {
        const disciplinaAluno = disciplina.alunos.find(a => a.id === aluno.id);
        return disciplinaAluno && disciplinaAluno.respostas_por_questao.some(resposta => resposta.respondeu);
      });
    });
    
    return studentsWithAnswers.map(aluno => {
      // Consolidar todas as respostas do aluno de todas as disciplinas
      const allResponses: Array<{
        questao: number;
        acertou: boolean;
        respondeu: boolean;
        resposta: string;
      }> = [];

      // Coletar respostas de todas as disciplinas
      tabelaDetalhada.disciplinas.forEach(disciplina => {
        const disciplinaAluno = disciplina.alunos.find(a => a.id === aluno.id);
        if (disciplinaAluno) {
          allResponses.push(...disciplinaAluno.respostas_por_questao);
        }
      });

      // Calcular totais consolidados
      const totalAcertos = allResponses.filter(r => r.respondeu && r.acertou).length;
      const totalRespondidas = allResponses.filter(r => r.respondeu).length;
      const totalQuestoes = allResponses.length;
      const totalErros = totalRespondidas - totalAcertos;
      const totalEmBranco = totalQuestoes - totalRespondidas;

      const disciplineMetrics: DisciplineMetricCell[] = tabelaDetalhada.disciplinas
        .filter((d) => d.nome && !isNomeDisciplinaGeral(d.nome))
        .map((disciplina) => {
          const da = disciplina.alunos.find((a) => a.id === aluno.id);
          return {
            disciplina: disciplina.nome,
            nota: Number(da?.nota ?? 0),
            proficiencia: Number(da?.proficiencia ?? 0),
            nivel: normalizeProficiencyLevelLabel(da?.nivel_proficiencia ?? ''),
          };
        });

      let nota = 0;
      let proficiencia = 0;
      let nivelProficiencia = 'Abaixo do Básico';

      const alunoGeral = tabelaDetalhada.geral?.alunos?.find((a) => a.id === aluno.id);
      if (alunoGeral) {
        nota = Number(alunoGeral.nota_geral ?? 0);
        proficiencia = Number(alunoGeral.proficiencia_geral ?? 0);
        nivelProficiencia = normalizeProficiencyLevelLabel(alunoGeral.nivel_proficiencia_geral ?? '');
      } else {
        const primeiraComDados = disciplineMetrics.find(
          (dm) => dm.nota > 0 || dm.proficiencia > 0 || (dm.nivel && dm.nivel !== 'Abaixo do Básico')
        );
        if (primeiraComDados) {
          nota = primeiraComDados.nota;
          proficiencia = primeiraComDados.proficiencia;
          nivelProficiencia = primeiraComDados.nivel;
        }
      }

      // Buscar moedas_ganhas se disponível
      let moedasGanhas = 0;
      if (tabelaDetalhada.geral?.alunos) {
        const alunoGeral = tabelaDetalhada.geral.alunos.find(a => a.id === aluno.id);
        if (alunoGeral?.moedas_ganhas !== undefined) {
          moedasGanhas = alunoGeral.moedas_ganhas;
        }
      }

      return {
        id: aluno.id,
        nome: aluno.nome,
        escola: aluno.escola,
        serie: aluno.serie,
        turma: aluno.turma,
        respostas_por_questao: allResponses,
        total_acertos: totalAcertos,
        total_erros: totalErros,
        total_respondidas: totalRespondidas,
        total_questoes_disciplina: totalQuestoes,
        nivel_proficiencia: nivelProficiencia,
        nota: nota,
        proficiencia: proficiencia,
        moedas_ganhas: moedasGanhas,
        disciplineMetrics,
        geralMetrics: {
          nota,
          proficiencia,
          nivel: nivelProficiencia,
        },
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [tabelaDetalhada.disciplinas, tabelaDetalhada.geral?.alunos]);

  // ✅ NOVO: Dados consolidados para a visão geral (já memoizados)
  const allQuestions = getAllQuestions;
  const consolidatedStudents = getConsolidatedStudents;

  const disciplineSummaryNames = useMemo(
    () =>
      tabelaDetalhada.disciplinas
        .map((d) => d.nome)
        .filter((nome) => nome?.trim() && !isNomeDisciplinaGeral(nome)),
    [tabelaDetalhada.disciplinas]
  );
  const useDisciplineSummaryInGeral = disciplineSummaryNames.length > 0;

  // ✅ NOVO: Componente para controles de navegação
  const QuestionNavigationControls = ({ 
    currentWindow, 
    totalWindows, 
    onPrevious, 
    onNext, 
    onGoToWindow,
    totalQuestions,
    questionsPerWindow,
    colorScheme = "purple"
  }: {
    currentWindow: number;
    totalWindows: number;
    onPrevious: () => void;
    onNext: () => void;
    onGoToWindow: (window: number) => void;
    totalQuestions: number;
    questionsPerWindow: number;
    colorScheme?: "purple" | "blue";
  }) => {
    if (totalWindows <= 1) return null;

    const startQuestion = currentWindow * questionsPerWindow + 1;
    const endQuestion = Math.min((currentWindow + 1) * questionsPerWindow, totalQuestions);
    const colorClasses = colorScheme === "purple" 
      ? "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400" 
      : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400";

    return (
      <div
        className={`${colorClasses} border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">
            Questões {startQuestion}-{endQuestion} de {totalQuestions}
          </span>
          <span className="text-xs opacity-75">
            (Janela {currentWindow + 1} de {totalWindows})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={currentWindow === 0}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          
          {/* Indicadores de janela */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalWindows, 5) }, (_, i) => {
              const windowIndex = i;
              const isActive = windowIndex === currentWindow;
              return (
                <button
                  key={windowIndex}
                  onClick={() => onGoToWindow(windowIndex)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isActive 
                      ? (colorScheme === "purple" ? "bg-purple-600 dark:bg-purple-500" : "bg-blue-600 dark:bg-blue-500")
                      : (colorScheme === "purple" ? "bg-purple-300 dark:bg-purple-700" : "bg-blue-300 dark:bg-blue-700")
                  }`}
                  title={`Ir para janela ${windowIndex + 1}`}
                />
              );
            })}
            {totalWindows > 5 && (
              <MoreHorizontal className="h-3 w-3 opacity-50" />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={currentWindow === totalWindows - 1}
            className="h-7 px-2"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* ✅ NOVO: Visão Geral - Todas as Questões */}
      {allQuestions.length > 0 && consolidatedStudents.length > 0 && (
        <Card className="shadow-xl border-2 border-purple-200 dark:border-purple-800 hover:shadow-2xl transition-shadow duration-300 overflow-hidden w-full">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-lg px-0">
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 gap-3 sm:gap-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold">V</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-bold truncate">Visão Geral - Todas as Questões</h2>
                  <p className="text-purple-100 text-xs sm:text-sm">
                    {consolidatedStudents.length} {consolidatedStudents.length === 1 ? 'aluno' : 'alunos'} • {allQuestions.length} {allQuestions.length === 1 ? 'questão' : 'questões'} de todas as disciplinas
                    {allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
                      <span className="block text-purple-200 text-xs mt-1">
                        📊 Visualização otimizada: {QUESTIONS_PER_WINDOW} questões por janela
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-white/90 dark:bg-white/10 text-purple-700 dark:text-purple-400 font-bold text-xs sm:text-sm flex-shrink-0">
                VISÃO GERAL
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* ✅ NOVO: Controles de navegação para muitas questões */}
            {allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
              <QuestionNavigationControls
                currentWindow={currentQuestionWindow}
                totalWindows={getTotalWindows(allQuestions.length)}
                onPrevious={() => setCurrentQuestionWindow(prev => Math.max(0, prev - 1))}
                onNext={() => setCurrentQuestionWindow(prev => Math.min(getTotalWindows(allQuestions.length) - 1, prev + 1))}
                onGoToWindow={(window) => setCurrentQuestionWindow(window)}
                totalQuestions={allQuestions.length}
                questionsPerWindow={QUESTIONS_PER_WINDOW}
                colorScheme="purple"
              />
            )}
            <div className="overflow-x-auto max-w-full results-table-scroll">
              <table className="min-w-full border border-border text-center text-xs sm:text-sm shadow-md rounded-lg border-separate border-spacing-0 bg-card">
                <TableHeader
                  totalQuestions={allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                    ? getQuestionWindow(allQuestions, currentQuestionWindow).length 
                    : allQuestions.length}
                  startQuestionNumber={allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                    ? currentQuestionWindow * QUESTIONS_PER_WINDOW + 1 
                    : 1}
                  visibleFields={{
                    turma: false,
                    habilidade: true, // Sempre exibir habilidades na tabela de alunos
                    questoes: true,
                    // Mostrar sempre (no modo “janelas” são poucas questões por vez)
                    percentualTurma: true,
                    total: true,
                    nota: !useDisciplineSummaryInGeral,
                    proficiencia: !useDisciplineSummaryInGeral,
                    nivel: !useDisciplineSummaryInGeral,
                  }}
                  disciplineSummaryNames={
                    useDisciplineSummaryInGeral ? disciplineSummaryNames : undefined
                  }
                  showCoins={showCoins}
                  tabelaDetalhada={{
                    disciplinas: (allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                      ? getQuestionWindow(allQuestions, currentQuestionWindow) 
                      : allQuestions).map((q, index) => ({
                      id: `disciplina-${q.numero}-${index}`,
                      nome: (q as QuestaoConsolidada).disciplina,
                      questoes: [{
                        numero: q.numero,
                        habilidade: q.habilidade,
                        codigo_habilidade: q.codigo_habilidade,
                        question_id: q.question_id
                      }]
                    }))
                  }}
                  students={consolidatedStudents.map(aluno => ({
                    id: aluno.id,
                    nome: aluno.nome,
                    acertos: aluno.total_acertos,
                    erros: aluno.total_erros,
                    em_branco: aluno.total_questoes_disciplina - aluno.total_respondidas,
                    respostas: aluno.respostas_por_questao.map(resposta => ({
                      questao_id: `q${resposta.questao}`,
                      questao_numero: resposta.questao,
                      resposta_correta: resposta.acertou,
                      resposta_em_branco: !resposta.respondeu,
                      tempo_gasto: 0
                    }))
                  }))}
                  successThreshold={60}
                />
                <tbody>
                  {consolidatedStudents.map((aluno, studentIndex) => (
                    <TableRow
                      key={`visao-geral-${aluno.id}`}
                      student={{
                        id: aluno.id,
                        nome: aluno.nome,
                        turma: aluno.turma,
                        nota: aluno.nota,
                        proficiencia: aluno.proficiencia,
                        classificacao: (aluno.nivel_proficiencia || 'Abaixo do Básico') as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
                        questoes_respondidas: aluno.total_respondidas,
                        acertos: aluno.total_acertos,
                        erros: aluno.total_erros,
                        em_branco: aluno.total_questoes_disciplina - aluno.total_respondidas,
                        tempo_gasto: 0,
                        status: 'concluida' as const,
                        moedas_ganhas: aluno.moedas_ganhas,
                        respostas: aluno.respostas_por_questao.map(resposta => ({
                          questao_id: `q${resposta.questao}`,
                          questao_numero: resposta.questao,
                          resposta_correta: resposta.acertou,
                          resposta_em_branco: !resposta.respondeu,
                          tempo_gasto: 0
                        }))
                      }}
                      studentIndex={studentIndex}
                      totalQuestions={allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                        ? getQuestionWindow(allQuestions, currentQuestionWindow).length 
                        : allQuestions.length}
                      visibleFields={{
                        turma: false,
                        habilidade: true, // Sempre exibir habilidades na tabela de alunos
                        questoes: true,
                        percentualTurma: true,
                        total: true,
                        nota: !useDisciplineSummaryInGeral,
                        proficiencia: !useDisciplineSummaryInGeral,
                        nivel: !useDisciplineSummaryInGeral,
                      }}
                      disciplineMetrics={
                        useDisciplineSummaryInGeral ? aluno.disciplineMetrics : undefined
                      }
                      geralMetrics={useDisciplineSummaryInGeral ? aluno.geralMetrics : undefined}
                      onViewStudentDetails={onViewStudentDetails}
                      onOpenInNewTab={onOpenInNewTab}
                      showCoins={showCoins}
                      evaluationId="visao-geral"
                      tabelaDetalhada={{
                        disciplinas: (allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                          ? getQuestionWindow(allQuestions, currentQuestionWindow) 
                          : allQuestions).map((q, index) => ({
                          id: `disciplina-${q.numero}-${index}`,
                          nome: (q as QuestaoConsolidada).disciplina,
                          questoes: [{
                            numero: q.numero,
                            habilidade: q.habilidade,
                            codigo_habilidade: q.codigo_habilidade,
                            question_id: q.question_id
                          }]
                        }))
                      }}
                    />
                  ))}
                </tbody>
              </table>
              {/* ✅ NOVO: Contador de questões no final */}
              {allQuestions.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
                <div className="bg-muted border-t border-border px-4 py-2 text-xs text-muted-foreground text-center">
                  Total: {allQuestions.length} questões • {consolidatedStudents.length} alunos • 
                  Janela {currentQuestionWindow + 1} de {getTotalWindows(allQuestions.length)}
                </div>
              )}
            </div>
            {/* ✅ NOVO: Legenda após a tabela */}
            <div className="px-4 pb-4">
              <TableLegend />
            </div>
          </CardContent>
        </Card>
      )}


      {/* Tabelas por Disciplina */}
      {tabelaDetalhada.disciplinas.map((disciplina) => (
        <Card key={disciplina.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden w-full">
          <CardHeader
            className={
              [
                "bg-gradient-to-r",
                getSubjectColors(disciplina.id, disciplina.nome).gradient,
                "text-white rounded-t-lg px-0"
              ].join(" ")
            }
          >
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 gap-3 sm:gap-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold">{disciplina.nome.charAt(0)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-bold truncate">{disciplina.nome}</h2>
                  <p className="text-blue-100 text-xs sm:text-sm">
                    {disciplina.alunos.length} {disciplina.alunos.length === 1 ? 'aluno' : 'alunos'} • {disciplina.questoes.length} {disciplina.questoes.length === 1 ? 'questão' : 'questões'}
                    {disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
                      <span className="block text-blue-200 text-xs mt-1">
                        📊 Visualização otimizada: {QUESTIONS_PER_WINDOW} questões por janela
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <DisciplineTag
                subjectId={disciplina.id}
                name={disciplina.nome.toUpperCase()}
                className="flex-shrink-0 text-xs font-bold sm:text-sm"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* ✅ NOVO: Controles de navegação para muitas questões */}
            {disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
              <QuestionNavigationControls
                currentWindow={getCurrentWindowForDiscipline(disciplina.id)}
                totalWindows={getTotalWindows(disciplina.questoes.length)}
                onPrevious={() => setCurrentWindowForDiscipline(disciplina.id, Math.max(0, getCurrentWindowForDiscipline(disciplina.id) - 1))}
                onNext={() => setCurrentWindowForDiscipline(disciplina.id, Math.min(getTotalWindows(disciplina.questoes.length) - 1, getCurrentWindowForDiscipline(disciplina.id) + 1))}
                onGoToWindow={(window) => setCurrentWindowForDiscipline(disciplina.id, window)}
                totalQuestions={disciplina.questoes.length}
                questionsPerWindow={QUESTIONS_PER_WINDOW}
                colorScheme="blue"
              />
            )}
            <div className="overflow-x-auto max-w-full results-table-scroll">
              <table className="min-w-full border border-border text-center text-xs sm:text-sm shadow-md rounded-lg border-separate border-spacing-0 bg-card">
                <TableHeader
                  totalQuestions={disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                    ? getQuestionWindow(disciplina.questoes, getCurrentWindowForDiscipline(disciplina.id)).length 
                    : disciplina.questoes.length}
                  startQuestionNumber={disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                    ? getCurrentWindowForDiscipline(disciplina.id) * QUESTIONS_PER_WINDOW + 1 
                    : 1}
                  visibleFields={{
                    turma: false,
                    habilidade: true, // Sempre exibir habilidades na tabela por disciplina
                    questoes: true,
                    percentualTurma: true,
                    total: true,
                    nota: true,
                    proficiencia: true,
                    nivel: true
                  }}
                  tabelaDetalhada={{
                    disciplinas: [{
                      ...disciplina,
                      questoes: disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                        ? getQuestionWindow(disciplina.questoes, getCurrentWindowForDiscipline(disciplina.id))
                        : disciplina.questoes
                    }]
                  }}
                  students={disciplina.alunos.map(aluno => ({
                    id: aluno.id,
                    nome: aluno.nome,
                    acertos: aluno.total_acertos,
                    erros: aluno.total_erros,
                    em_branco: aluno.total_questoes_disciplina - aluno.total_respondidas,
                    respostas: aluno.respostas_por_questao.map(resposta => ({
                      questao_id: `q${resposta.questao}`,
                      questao_numero: resposta.questao,
                      resposta_correta: resposta.acertou,
                      resposta_em_branco: !resposta.respondeu,
                      tempo_gasto: 0
                    }))
                  }))}
                  successThreshold={60}
                  showCoins={showCoins}
                />
                <tbody>
                  {disciplina.alunos.filter(aluno => {
                    // ✅ CORRIGIDO: Filtrar apenas alunos que responderam pelo menos uma questão
                    return aluno.respostas_por_questao.some(resposta => resposta.respondeu);
                  }).sort((a, b) => a.nome.localeCompare(b.nome)).map((aluno, studentIndex) => (
                    <TableRow
                      key={`${disciplina.id}-${aluno.id}`}
                      student={{
                        id: aluno.id,
                        nome: aluno.nome,
                        turma: aluno.turma,
                        nota: aluno.nota,
                        proficiencia: aluno.proficiencia,
                        classificacao: (aluno.nivel_proficiencia || 'Abaixo do Básico') as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
                        questoes_respondidas: aluno.total_respondidas,
                        acertos: aluno.total_acertos,
                        erros: aluno.total_erros,
                        em_branco: aluno.total_questoes_disciplina - aluno.total_respondidas,
                        tempo_gasto: 0,
                        status: 'concluida' as const,
                        moedas_ganhas: aluno.moedas_ganhas,
                        respostas: aluno.respostas_por_questao.map(resposta => ({
                          questao_id: `q${resposta.questao}`,
                          questao_numero: resposta.questao,
                          resposta_correta: resposta.acertou,
                          resposta_em_branco: !resposta.respondeu,
                          tempo_gasto: 0
                        }))
                      }}
                      studentIndex={studentIndex}
                      totalQuestions={disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                        ? getQuestionWindow(disciplina.questoes, getCurrentWindowForDiscipline(disciplina.id)).length 
                        : disciplina.questoes.length}
                      visibleFields={{
                        turma: false,
                        habilidade: true, // Sempre exibir habilidades na tabela por disciplina
                        questoes: true,
                        percentualTurma: true,
                        total: true,
                        nota: true,
                        proficiencia: true,
                        nivel: true
                      }}
                      onViewStudentDetails={onViewStudentDetails}
                      onOpenInNewTab={onOpenInNewTab}
                      showCoins={showCoins}
                      evaluationId={disciplina.id}
                      tabelaDetalhada={{
                        disciplinas: [{
                          ...disciplina,
                          questoes: disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW 
                            ? getQuestionWindow(disciplina.questoes, getCurrentWindowForDiscipline(disciplina.id))
                            : disciplina.questoes
                        }]
                      }}
                    />
                  ))}
                </tbody>
              </table>
              {/* ✅ NOVO: Contador de questões no final */}
              {disciplina.questoes.length > MAX_QUESTIONS_FOR_FULL_VIEW && (
                <div className="bg-muted border-t border-border px-4 py-2 text-xs text-muted-foreground text-center">
                  {disciplina.nome}: {disciplina.questoes.length} questões • {disciplina.alunos.length} alunos • 
                  Janela {getCurrentWindowForDiscipline(disciplina.id) + 1} de {getTotalWindows(disciplina.questoes.length)}
                </div>
              )}
            </div>
            {/* ✅ NOVO: Legenda após a tabela */}
            <div className="px-4 pb-4">
              <TableLegend />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};