import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { getReportProficiencyTagClass } from '@/utils/report/reportTagStyles';
import {
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  FileText,
  GraduationCap,
  RefreshCw,
  School,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface GeralAluno {
  id: string;
  nome: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nota_geral: number;
  proficiencia_geral: number;
  nivel_proficiencia_geral: string;
  total_acertos_geral: number;
  total_questoes_geral: number;
  total_respondidas_geral: number;
  total_em_branco_geral?: number;
  percentual_acertos_geral: number;
  status_geral: string;
  respostas_por_questao?: Array<{ questao: number; acertou: boolean; respondeu: boolean; resposta: string }>;
}

interface DisciplinaTabela {
  id: string;
  nome: string;
  questoes: Array<{ numero: number; habilidade?: string; codigo_habilidade?: string; question_id?: string }>;
  alunos: Array<{
    id: string;
    nome: string;
    respostas_por_questao: Array<{ questao: number; acertou: boolean; respondeu: boolean; resposta: string }>;
    total_acertos: number;
    total_erros: number;
    total_respondidas: number;
    total_questoes_disciplina: number;
    nivel_proficiencia: string;
    nota: number;
    proficiencia: number;
  }>;
}

interface ResultadosAgregadosResponse {
  estatisticas_gerais?: { escola?: string; nome?: string; municipio?: string; serie?: string };
  resultados_detalhados?: { gabaritos: Array<{ id: string; titulo: string }> };
  tabela_detalhada?: {
    disciplinas?: DisciplinaTabela[];
    geral?: { alunos: GeralAluno[] };
  };
}

function formatScoreForDisplay(value: unknown, decimals = 1): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(decimals);
}

function formatProficiencyForDisplay(value: unknown): string {
  return formatScoreForDisplay(value);
}

interface AnswerSheetStudentDetailedResultsProps {
  onBack: () => void;
}

export default function AnswerSheetStudentDetailedResults({ onBack }: AnswerSheetStudentDetailedResultsProps) {
  const { gabaritoId, studentId } = useParams<{ gabaritoId: string; studentId: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [data, setData] = useState<ResultadosAgregadosResponse | null>(null);
  const [geralAluno, setGeralAluno] = useState<GeralAluno | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 'all' ou nome exato da disciplina */
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');

  const estado = searchParams.get('estado') || '';
  const municipio = searchParams.get('municipio') || '';
  const escola = searchParams.get('escola') || '';
  const serie = searchParams.get('serie') || '';
  const turma = searchParams.get('turma') || '';
  const periodo = searchParams.get('periodo') || '';
  const periodoApi = /^\d{4}-\d{2}$/.test(periodo) ? periodo : undefined;

  const tituloGabarito = useMemo(() => {
    const g = data?.resultados_detalhados?.gabaritos?.find((x) => x.id === gabaritoId);
    return g?.titulo ?? 'Cartão resposta';
  }, [data, gabaritoId]);

  const load = useCallback(async () => {
    if (!gabaritoId || !studentId || !estado || !municipio) {
      setError('Parâmetros insuficientes. Volte aos resultados e abra o aluno a partir da lista.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('estado', estado);
      params.set('municipio', municipio);
      params.set('gabarito', gabaritoId);
      if (escola) params.set('escola', escola);
      if (serie) params.set('serie', serie);
      if (turma) params.set('turma', turma);
      if (periodoApi) params.set('periodo', periodoApi);
      const res = await api.get<ResultadosAgregadosResponse>(
        `/answer-sheets/resultados-agregados?${params.toString()}`
      );
      const payload = res.data;
      setData(payload);
      const aluno = payload?.tabela_detalhada?.geral?.alunos?.find((a) => String(a.id) === String(studentId));
      setGeralAluno(aluno ?? null);
      if (!aluno) {
        setError('Aluno não encontrado neste recorte de filtros. Ajuste os filtros na página de resultados e tente de novo.');
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : '';
      setError(msg || 'Não foi possível carregar os resultados.');
      setData(null);
      setGeralAluno(null);
      toast({ title: 'Erro', description: msg || 'Falha ao carregar dados.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [gabaritoId, studentId, estado, municipio, escola, serie, turma, periodoApi, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const perDisciplina = useMemo(() => {
    if (!studentId || !data?.tabela_detalhada?.disciplinas?.length) return [];
    return data.tabela_detalhada.disciplinas
      .map((d) => {
        const aluno = d.alunos?.find((a) => String(a.id) === String(studentId));
        if (!aluno) return null;
        return { disciplina: d.nome, questoes: d.questoes ?? [], aluno };
      })
      .filter(Boolean) as Array<{
      disciplina: string;
      questoes: DisciplinaTabela['questoes'];
      aluno: DisciplinaTabela['alunos'][0];
    }>;
  }, [data, studentId]);

  const disciplineNames = useMemo(
    () =>
      perDisciplina
        .map((d) => d.disciplina)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [perDisciplina]
  );

  const visiblePerDisciplina = useMemo(() => {
    if (disciplineFilter === 'all') return perDisciplina;
    return perDisciplina.filter((d) => d.disciplina === disciplineFilter);
  }, [perDisciplina, disciplineFilter]);

  useEffect(() => {
    if (disciplineFilter === 'all') return;
    if (!disciplineNames.includes(disciplineFilter)) {
      setDisciplineFilter('all');
    }
  }, [disciplineNames, disciplineFilter]);

  const showGeralRespostas =
    disciplineFilter === 'all' &&
    geralAluno?.respostas_por_questao &&
    geralAluno.respostas_por_questao.length > 0;

  const escolaNome =
    geralAluno?.escola || data?.estatisticas_gerais?.escola || data?.estatisticas_gerais?.nome || 'Não informada';

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && !geralAluno) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-medium mb-2">Não foi possível exibir o resultado</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">{error}</p>
          <Button onClick={load} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!geralAluno) {
    return null;
  }

  const totalQ = geralAluno.total_questoes_geral ?? 0;
  const acertos = geralAluno.total_acertos_geral ?? 0;
  const erros = Math.max(0, totalQ - acertos - (geralAluno.total_em_branco_geral ?? 0));
  const classificacao = geralAluno.nivel_proficiencia_geral || 'Não classificado';
  const concluida = (geralAluno.status_geral || '').toLowerCase() === 'concluida';

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex-1 space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Resultados detalhados do aluno</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Cartão resposta · {tituloGabarito}</p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <School className="h-4 w-4 text-purple-600" />
            Escola
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">{escolaNome}</div>
          <p className="text-xs text-muted-foreground mt-1">Instituição de ensino</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Nome do aluno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 break-words">{geralAluno.nome}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-green-600" />
              Série
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{geralAluno.serie || 'Não informada'}</div>
          </CardContent>
        </Card>
        {geralAluno.turma ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-600" />
                Turma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{geralAluno.turma}</div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Total de questões
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalQ}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Acertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{acertos}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalQ > 0 ? `${((acertos / totalQ) * 100).toFixed(1)}% de acerto` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />
              Nota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatScoreForDisplay(geralAluno.nota_geral)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-600" />
              Proficiência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatProficiencyForDisplay(geralAluno.proficiencia_geral)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Erros estimados: {erros}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Status da correção:</span>
        <Badge variant={concluida ? 'default' : 'secondary'} className={concluida ? 'bg-green-600' : ''}>
          {concluida ? 'Concluída' : geralAluno.status_geral || 'Pendente'}
        </Badge>
        <Badge className={getReportProficiencyTagClass(classificacao)}>{classificacao}</Badge>
      </div>

      {classificacao && classificacao !== 'Não classificado' && (
        <Card>
          <CardHeader>
            <CardTitle>Classificação de proficiência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm mb-2">
              <span>Nível alcançado</span>
              <span className="font-bold">
                {geralAluno.proficiencia_geral != null && Number.isFinite(Number(geralAluno.proficiencia_geral))
                  ? `${formatProficiencyForDisplay(geralAluno.proficiencia_geral)} pontos`
                  : '0 pontos'}
              </span>
            </div>
            <Progress
              value={Math.min(((geralAluno.proficiencia_geral ?? 0) / 412.5) * 100, 100)}
              className="h-3"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Informações do cartão resposta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Título</h4>
              <p className="text-lg">{tituloGabarito}</p>
            </div>
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Município</h4>
              <p className="text-lg">{data?.estatisticas_gerais?.municipio ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {disciplineNames.length > 1 ? (
        <div
          className="flex flex-wrap gap-2 rounded-lg border border-border/60 bg-muted/30 p-3"
          role="tablist"
          aria-label="Filtrar por disciplina"
        >
          <Button
            type="button"
            size="sm"
            variant={disciplineFilter === 'all' ? 'default' : 'outline'}
            className={cn('rounded-full shrink-0', disciplineFilter === 'all' && 'shadow-sm')}
            onClick={() => setDisciplineFilter('all')}
            role="tab"
            aria-selected={disciplineFilter === 'all'}
          >
            Todas
          </Button>
          {disciplineNames.map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={disciplineFilter === name ? 'default' : 'outline'}
              className={cn(
                'rounded-full shrink-0 max-w-[220px] truncate',
                disciplineFilter === name && 'shadow-sm'
              )}
              onClick={() => setDisciplineFilter(name)}
              role="tab"
              aria-selected={disciplineFilter === name}
              title={name}
            >
              {name}
            </Button>
          ))}
        </div>
      ) : null}

      {showGeralRespostas && (
        <Card>
          <CardHeader>
            <CardTitle>Respostas (visão geral)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3">Questão</th>
                  <th className="text-left py-2 px-3">Resposta</th>
                  <th className="text-left py-2 px-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {geralAluno.respostas_por_questao.map((r) => (
                  <tr key={r.questao} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium">Q{r.questao}</td>
                    <td className="py-2 px-3">{r.respondeu ? r.resposta || '—' : '—'}</td>
                    <td className="py-2 px-3">
                      {!r.respondeu ? (
                        <Badge variant="outline">Em branco</Badge>
                      ) : r.acertou ? (
                        <Badge className="bg-green-600">Acerto</Badge>
                      ) : (
                        <Badge variant="destructive">Erro</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {visiblePerDisciplina.map(({ disciplina, questoes, aluno }) => (
        <Card key={disciplina}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 justify-between">
              <span>{disciplina}</span>
              <div className="flex flex-wrap gap-2 text-sm font-normal">
                <Badge variant="secondary">Nota: {formatScoreForDisplay(aluno.nota)}</Badge>
                <Badge variant="outline">Prof.: {formatProficiencyForDisplay(aluno.proficiencia)}</Badge>
                <Badge className={getReportProficiencyTagClass(aluno.nivel_proficiencia)}>
                  {aluno.nivel_proficiencia || '—'}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3">Questão</th>
                  <th className="text-left py-2 px-3">Habilidade</th>
                  <th className="text-left py-2 px-3">Resposta</th>
                  <th className="text-left py-2 px-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {questoes.map((q) => {
                  const r = aluno.respostas_por_questao?.find((x) => x.questao === q.numero);
                  return (
                    <tr key={q.numero} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">Q{q.numero}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {q.codigo_habilidade || q.habilidade || '—'}
                      </td>
                      <td className="py-2 px-3">
                        {r?.respondeu ? r.resposta || '—' : '—'}
                      </td>
                      <td className="py-2 px-3">
                        {!r || !r.respondeu ? (
                          <Badge variant="outline">Em branco</Badge>
                        ) : r.acertou ? (
                          <Badge className="bg-green-600">Acerto</Badge>
                        ) : (
                          <Badge variant="destructive">Erro</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {!showGeralRespostas && visiblePerDisciplina.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Não há detalhamento por questão neste recorte. Os totais acima refletem o que a API enviou.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
