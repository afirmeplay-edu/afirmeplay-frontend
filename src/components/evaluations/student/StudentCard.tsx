import React from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Eye } from 'lucide-react';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';

interface StudentCardProps {
  student: {
    id: string;
    nome: string;
    turma: string;
    nota: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    questoes_respondidas: number;
    acertos: number;
    erros: number;
    em_branco: number;
    tempo_gasto: number;
    status: 'concluida' | 'pendente';
  };
  totalQuestions: number;
  subjects: string[];
  onViewDetails: (studentId: string) => void;
}

function MiniBar({ value }: { value: number }) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export const StudentCard = React.memo(function StudentCard({ student, totalQuestions, subjects, onViewDetails }: StudentCardProps) {
  const accuracyRate = (student.questoes_respondidas || 0) > 0
    ? ((student.acertos || 0) / (student.questoes_respondidas || 0)) * 100
    : 0;
  
  const erros = student.erros || 0;
  const emBranco = student.em_branco || 0;
  const tempoGasto = student.tempo_gasto || 0;

  const shortSubjects = subjects.slice(0, 2);

  return (
    <Card className="group overflow-hidden border border-border bg-card shadow-sm transition-colors duration-200 hover:border-border/80">
      {/* Header minimalista */}
      <div className="relative bg-gradient-to-r from-purple-700 to-purple-600 px-3 py-3 text-white">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm sm:text-base font-semibold text-white leading-snug break-words whitespace-normal">
                {student.nome}
              </CardTitle>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="bg-white/20 text-white border-white/30 shrink-0 whitespace-nowrap"
          >
            {student.turma}
          </Badge>
        </div>
        
        {/* Status badges minimalistas */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={student.status === 'concluida' 
            ? 'bg-green-500/90 text-white border-green-400' 
            : 'bg-yellow-500/90 text-white border-yellow-400'}>
            {student.status === 'concluida' ? 'Concluída' : 'Pendente'}
          </Badge>
          <Badge className={student.classificacao === 'Avançado' ? 'bg-emerald-500 text-white' : 
                           student.classificacao === 'Adequado' ? 'bg-green-500 text-white' : 
                           student.classificacao === 'Básico' ? 'bg-yellow-500 text-white' : 
                           'bg-red-500 text-white'}>
            {student.classificacao}
          </Badge>
        </div>
      </div>

      <CardContent className="p-3 space-y-3 overflow-hidden">
        {/* Linha de métricas compacta */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2 min-w-0">
            <div className="text-[clamp(0.95rem,2.2vw,1.15rem)] font-bold text-foreground tabular-nums whitespace-nowrap leading-none">
              {formatDecimal1PtBr(student.nota)}
            </div>
            <div className="text-[11px] text-muted-foreground">Nota</div>
          </div>
          <div className="rounded-lg border border-purple-200/60 dark:border-purple-900/40 bg-purple-50/70 dark:bg-purple-950/20 px-2.5 py-2 min-w-0">
            <div className="text-[clamp(0.95rem,2.2vw,1.15rem)] font-bold text-purple-700 dark:text-purple-300 tabular-nums whitespace-nowrap leading-none">
              {formatDecimal1PtBr(student.proficiencia)}
            </div>
            <div className="text-[11px] text-purple-800/80 dark:text-purple-200/80">Proficiência</div>
          </div>
        </div>

        {/* Taxa de acerto compacta */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Acerto</span>
            <span className="font-semibold text-foreground tabular-nums">{formatPercent1PtBr(accuracyRate)}</span>
          </div>
          <MiniBar value={accuracyRate} />
          <div className="text-[11px] text-muted-foreground text-center tabular-nums">
            {student.acertos || 0}/{totalQuestions}
          </div>
        </div>

        {/* Acertos/Erros + Total */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
            <div className="text-sm font-bold text-foreground tabular-nums">{student.acertos || 0}</div>
            <div className="text-[11px] text-muted-foreground">Acertos</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
            <div className="text-sm font-bold text-foreground tabular-nums">{erros}</div>
            <div className="text-[11px] text-muted-foreground">Erros</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
            <div className="text-sm font-bold text-foreground tabular-nums">{totalQuestions}</div>
            <div className="text-[11px] text-muted-foreground">Questões</div>
          </div>
        </div>

        {/* Disciplinas + tempo */}
        <div className="flex items-start justify-between gap-3 pt-2 border-t border-border text-xs">
          <div className="min-w-0">
            <div className="text-muted-foreground mb-1">Disciplinas</div>
            <div className="flex flex-wrap gap-1">
              {shortSubjects.map((subject, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-[11px] bg-muted/40 text-foreground border-border truncate max-w-[140px]"
                  title={subject}
                >
                  {subject}
                </Badge>
              ))}
              {subjects.length > 2 && (
                <Badge variant="outline" className="text-[11px] bg-muted/40 text-foreground border-border">
                  +{subjects.length - 2}
                </Badge>
              )}
            </div>
          </div>
          {tempoGasto > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-muted-foreground">Tempo</div>
              <div className="font-semibold text-foreground tabular-nums">{Math.round(tempoGasto / 60)}min</div>
            </div>
          )}
        </div>

        {/* Botão */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewDetails(student.id)}
          className="w-full bg-card text-foreground border-border hover:bg-muted hover:border-border transition-colors"
        >
          <Eye className="h-4 w-4 mr-2" />
          Ver detalhes
        </Button>
      </CardContent>
    </Card>
  );
});
