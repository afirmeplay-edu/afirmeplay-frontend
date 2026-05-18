import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, UserX, Medal, Award, Star, TrendingUp, Users, Coins } from "lucide-react";
import { 
  getMedalEmoji, 
  getPositionHighlightClass, 
  getPositionTextColor,
  formatCoins 
} from "@/utils/coins";
import { getReportProficiencyTagClass } from "@/utils/report/reportTagStyles";

interface Student {
  id: string;
  nome: string;
  turma: string;
  escola?: string;
  serie?: string;
  nota: number;
  proficiencia: number;
  /** Nível de proficiência (texto da API); vazio quando o backend não envia nível. */
  classificacao: string;
  status: 'concluida' | 'pendente';
  moedas_ganhas?: number; // Opcional para competições
  posicao?: number; // Posição no ranking (opcional)
}

interface StudentRankingProps {
  students: Student[];
  maxStudents?: number;
  showCoins?: boolean; // Mostrar coluna de moedas (para competições)
  isCompetition?: boolean; // Se é ranking de competição
  /** Quando true: exibe todos na lista principal, ordenados por `posicao` (fonte: backend). */
  backendRankingOrder?: boolean;
}

export function StudentRanking({ 
  students, 
  maxStudents = 50,
  showCoins = false,
  isCompetition = false,
  backendRankingOrder = false,
}: StudentRankingProps) {
  const normStatus = (s: Student['status'] | undefined) => String(s ?? '').trim().toLowerCase();

  // Separar alunos que participaram da avaliação dos que não concluíram (faltosos / pendente)
  const { completedStudents, absentStudents } = useMemo(() => {
    if (backendRankingOrder) {
      return { completedStudents: students, absentStudents: [] as Student[] };
    }
    const completed = students.filter((student) => normStatus(student.status) === 'concluida');
    const absent = students.filter((student) => normStatus(student.status) !== 'concluida');

    return { completedStudents: completed, absentStudents: absent };
  }, [students, backendRankingOrder]);

  // Ordenação: backend (`posicao`) nas avaliações online; competição com posição; senão proficiência.
  const rankedStudents = useMemo(() => {
    let sorted: Student[];
    if (backendRankingOrder) {
      sorted = [...completedStudents].sort((a, b) => (a.posicao ?? 999999) - (b.posicao ?? 999999));
    } else if (isCompetition && students.some((s) => s.posicao !== undefined)) {
      sorted = [...completedStudents].sort((a, b) => (a.posicao || 999) - (b.posicao || 999));
    } else {
      sorted = [...completedStudents].sort((a, b) => (b.proficiencia || 0) - (a.proficiencia || 0));
    }

    return sorted
      .map((student, index) => ({
        ...student,
        posicao: backendRankingOrder
          ? (student.posicao ?? index + 1)
          : student.posicao || index + 1,
      }))
      .slice(0, maxStudents);
  }, [backendRankingOrder, completedStudents, maxStudents, isCompetition, students]);

  const maxProficiencyBySerie = useMemo(() => {
    const serieToMax: Record<string, number> = {};
    for (const student of completedStudents) {
      const serie = String(student.serie || '').trim() || 'Sem série';
      const prof = Number(student.proficiencia || 0);
      if (serieToMax[serie] === undefined || prof > serieToMax[serie]) {
        serieToMax[serie] = prof;
      }
    }
    return serieToMax;
  }, [completedStudents]);

  // Função para obter ícone do ranking
  const getRankingIcon = (position: number) => {
    const medalEmoji = getMedalEmoji(position);
    if (medalEmoji) {
      return <span className="text-2xl">{medalEmoji}</span>;
    }
    if (position === 1) return <Trophy className="h-6 w-6 text-amber-500" />;
    if (position === 2) return <Medal className="h-6 w-6 text-muted-foreground" />;
    if (position === 3) return <Award className="h-6 w-6 text-amber-600 dark:text-amber-500" />;
    return <span className="text-lg font-bold text-muted-foreground">{position}</span>;
  };

  // Função para obter cor de fundo do ranking (usando utils de coins)
  const getRankingBackground = (position: number) => {
    const highlightClass = getPositionHighlightClass(position);
    if (highlightClass) return highlightClass;
    return 'bg-card border-border';
  };

  // Função para obter cor do nível
  const getLevelColor = (classificacao: string) => {
    switch (classificacao) {
      case 'Avançado': return 'bg-green-500';
      case 'Adequado': return 'bg-blue-500';
      case 'Básico': return 'bg-yellow-500';
      case 'Abaixo do Básico': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // A cor/estilo do badge de proficiência segue o padrão do Relatório Escolar.

  return (
    <div className="space-y-6">
      {/* Ranking dos Melhores Alunos */}
      <Card className="border border-border shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-purple-600 text-white">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 bg-white/10 rounded-lg">
                <Trophy className="h-6 w-6 text-purple-200" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Ranking dos Melhores</h1>
                <p className="text-purple-100 text-sm">
                  {backendRankingOrder
                    ? 'Ordem e posições definidas pelo servidor'
                    : 'Classificação por proficiência'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-purple-100">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {rankedStudents.length} {rankedStudents.length === 1 ? 'aluno' : 'alunos'}
                </span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {rankedStudents.length > 0 ? (
            <div className="space-y-4">
              {rankedStudents.map((student, index) => {
                const position = student.posicao || 1;
                const positionColor = getPositionTextColor(position);

                return (
                  <div
                    key={`${student.id ?? 'r'}-${index}`}
                    className={`flex flex-col sm:flex-row sm:items-center items-start gap-4 p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${getRankingBackground(position)}`}
                  >
                    {/* Posição no ranking */}
                    <div
                      className={`flex items-center justify-center w-12 h-12 rounded-lg bg-card border-2 ${
                        position <= 3 ? 'border-yellow-400 dark:border-yellow-600' : 'border-border'
                      } shadow-sm self-center sm:self-auto`}
                    >
                      {getRankingIcon(position)}
                    </div>

                    {/* Informações do aluno */}
                    <div className="flex-1 min-w-0">
                      <div className="mb-2 flex items-center gap-3 flex-wrap">
                        <h3 className={`font-semibold truncate text-base ${positionColor}`}>
                          {student.nome}
                        </h3>
                        {position <= 3 && (
                          <Badge className="bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-400 border-yellow-300 text-xs font-bold">
                            {position}º Lugar
                          </Badge>
                        )}
                      </div>

                      {(student.escola || student.serie || student.turma) && (
                        <div className="mb-2 space-y-1">
                          {student.escola ? (
                            <p className="text-xs leading-4 text-muted-foreground whitespace-normal break-words">
                              {student.escola}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {student.serie ? `Série: ${student.serie}` : "Série: —"}
                            {" • "}
                            {student.turma ? `Turma: ${student.turma}` : "Turma: —"}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                          <span className="font-medium">Nota:</span>
                          <span className="font-semibold text-foreground">{(student.nota || 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="font-medium">Proficiência:</span>
                          <span className="font-semibold text-foreground">{Number(student.proficiencia || 0).toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">
                            {`(Proeficiência máx. do ${student.serie || 'série'}: ${Number(
                              maxProficiencyBySerie[String(student.serie || '').trim() || 'Sem série'] || 0
                            ).toFixed(1)})`}
                          </span>
                        </div>
                        {showCoins && student.moedas_ganhas !== undefined && (
                          <div className="flex items-center gap-2">
                            <Coins className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
                            <span className="font-medium">Moedas:</span>
                            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                              {formatCoins(student.moedas_ganhas)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nível de proficiência e moedas */}
                    <div className="flex flex-col items-start sm:items-end gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-xs text-muted-foreground font-medium">Nível</div>
                        <Badge className={getReportProficiencyTagClass(student.classificacao)}>
                          {student.classificacao?.trim() ? student.classificacao : '—'}
                        </Badge>
                      </div>
                      {showCoins && student.moedas_ganhas !== undefined && student.moedas_ganhas > 0 && (
                        <Badge className="bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-400 border-yellow-300 text-xs font-bold">
                          <Coins className="w-3 h-3 mr-1" />
                          {formatCoins(student.moedas_ganhas)}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhum aluno participou da avaliação
              </h3>
              <p className="text-muted-foreground">
                Não há dados de alunos que concluíram a avaliação para gerar o ranking.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alunos Ausentes */}
      {absentStudents.length > 0 && (
        <Card className="border border-border shadow-lg">
          <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-600 text-white">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-white/10 rounded-lg">
                  <UserX className="h-6 w-6 text-red-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Alunos Ausentes</h2>
                  <p className="text-gray-300 dark:text-gray-400 text-sm">
                    Alunos que não participaram da avaliação
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-300 dark:text-gray-400">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {absentStudents.length} {absentStudents.length === 1 ? 'aluno' : 'alunos'}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {absentStudents.map((student, index) => (
                <div
                  key={`${student.id ?? 'a'}-${index}`}
                  className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border hover:bg-muted/80 transition-colors duration-200"
                >
                  <div className="w-8 h-8 rounded-full bg-muted-foreground/50 flex items-center justify-center">
                    <UserX className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate text-sm">{student.nome}</h4>
                    <p className="text-xs text-muted-foreground">
                      {student.serie ? `Série: ${student.serie}` : "Série: —"}
                      {" • "}
                      {student.turma ? `Turma: ${student.turma}` : "Turma: —"}
                    </p>
                    {student.escola ? (
                      <p className="text-xs leading-4 text-muted-foreground whitespace-normal break-words">
                        {student.escola}
                      </p>
                    ) : null}
                  </div>

                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Ausente
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
