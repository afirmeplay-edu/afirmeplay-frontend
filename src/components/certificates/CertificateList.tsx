import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, CheckCircle2, Clock, Users, Search, Trophy, ClipboardList, User } from 'lucide-react';
import { CertificatesApiService } from '@/services/certificatesApi';
import { useAuth } from '@/context/authContext';
import type { EvaluationWithCertificates } from '@/types/certificates';

function isOlimpiadaEvaluation(evaluation: EvaluationWithCertificates) {
  return evaluation.type?.toUpperCase() === 'OLIMPIADA';
}

function evaluationSubjects(evaluation: EvaluationWithCertificates): string[] {
  if (evaluation.subjects?.length) return evaluation.subjects;
  if (!evaluation.subject || evaluation.subject === 'Disciplina não informada') return [];
  return evaluation.subject.split(',').map((s) => s.trim()).filter(Boolean);
}

function matchesSubjectFilter(evaluation: EvaluationWithCertificates, subjectFilter: string) {
  if (subjectFilter === 'all') return true;
  return evaluationSubjects(evaluation).includes(subjectFilter);
}

interface CertificateListProps {
  schoolId?: string;
  municipalityId?: string;
  isAdmin?: boolean;
  onSelectEvaluation: (evaluationId: string, evaluationData?: EvaluationWithCertificates) => void;
}

export function CertificateList({ schoolId, municipalityId, isAdmin = false, onSelectEvaluation }: CertificateListProps) {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState<EvaluationWithCertificates[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'avaliacoes' | 'olimpiadas'>('avaliacoes');
  
  // Filtros para Avaliações
  const [searchAvaliacao, setSearchAvaliacao] = useState('');
  const [statusFilterAvaliacao, setStatusFilterAvaliacao] = useState<string>('all');
  const [subjectFilterAvaliacao, setSubjectFilterAvaliacao] = useState<string>('all');
  const [ownerFilterAvaliacao, setOwnerFilterAvaliacao] = useState<string>('mine'); // 'mine' | 'all'
  
  // Filtros para Olimpíadas
  const [searchOlimpiada, setSearchOlimpiada] = useState('');
  const [statusFilterOlimpiada, setStatusFilterOlimpiada] = useState<string>('all');
  const [subjectFilterOlimpiada, setSubjectFilterOlimpiada] = useState<string>('all');
  const [ownerFilterOlimpiada, setOwnerFilterOlimpiada] = useState<string>('mine'); // 'mine' | 'all'

  useEffect(() => {
    const loadEvaluations = async () => {
      const missingContext = user?.role === 'tecadm'
        ? !municipalityId
        : !schoolId || !municipalityId;
      if (!isAdmin && missingContext) return;
      
      setIsLoading(true);
      try {
        const data = await CertificatesApiService.getCertificateEvaluations({
          municipalityId,
        });
        setEvaluations(data);
      } catch (error) {
        console.error('Erro ao carregar avaliações:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEvaluations();
  }, [schoolId, municipalityId, isAdmin, user?.role]);

  const avaliacoes = useMemo(() => {
    return evaluations.filter((e) => !isOlimpiadaEvaluation(e));
  }, [evaluations]);

  const olimpiadas = useMemo(() => {
    return evaluations.filter((e) => isOlimpiadaEvaluation(e));
  }, [evaluations]);

  // Contar minhas avaliações/olimpíadas
  const myAvaliacoesCount = useMemo(() => {
    return avaliacoes.filter(e => e.created_by?.id === user?.id).length;
  }, [avaliacoes, user?.id]);

  const myOlimpiadasCount = useMemo(() => {
    return olimpiadas.filter(e => e.created_by?.id === user?.id).length;
  }, [olimpiadas, user?.id]);

  // Extrair disciplinas únicas para filtros
  const subjectsAvaliacao = useMemo(() => {
    const subjects = new Set<string>();
    avaliacoes.forEach((e) => evaluationSubjects(e).forEach((s) => subjects.add(s)));
    return Array.from(subjects).sort();
  }, [avaliacoes]);

  const subjectsOlimpiada = useMemo(() => {
    const subjects = new Set<string>();
    olimpiadas.forEach((e) => evaluationSubjects(e).forEach((s) => subjects.add(s)));
    return Array.from(subjects).sort();
  }, [olimpiadas]);

  // Função auxiliar para obter timestamp de forma segura
  const getTimestamp = (dateString?: string): number => {
    if (!dateString) return 0;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  };

  // Filtrar e ordenar avaliações (minhas primeiro)
  const filteredAvaliacoes = useMemo(() => {
    let filtered = avaliacoes.filter(e => {
      const matchSearch = searchAvaliacao === '' || 
        e.title.toLowerCase().includes(searchAvaliacao.toLowerCase()) ||
        evaluationSubjects(e).some((s) => s.toLowerCase().includes(searchAvaliacao.toLowerCase()));
      const matchStatus = statusFilterAvaliacao === 'all' || e.certificate_status === statusFilterAvaliacao;
      const matchSubject = matchesSubjectFilter(e, subjectFilterAvaliacao);
      const matchOwner = ownerFilterAvaliacao === 'all' || e.created_by?.id === user?.id;
      return matchSearch && matchStatus && matchSubject && matchOwner;
    });

    // Ordenar: minhas avaliações primeiro
    return filtered.sort((a, b) => {
      const aIsMine = a.created_by?.id === user?.id ? 0 : 1;
      const bIsMine = b.created_by?.id === user?.id ? 0 : 1;
      if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      // Se ambas são minhas ou não, ordenar por data (mais recente primeiro)
      return getTimestamp(b.applied_at) - getTimestamp(a.applied_at);
    });
  }, [avaliacoes, searchAvaliacao, statusFilterAvaliacao, subjectFilterAvaliacao, ownerFilterAvaliacao, user?.id]);

  // Filtrar e ordenar olimpíadas (minhas primeiro)
  const filteredOlimpiadas = useMemo(() => {
    let filtered = olimpiadas.filter(e => {
      const matchSearch = searchOlimpiada === '' || 
        e.title.toLowerCase().includes(searchOlimpiada.toLowerCase()) ||
        evaluationSubjects(e).some((s) => s.toLowerCase().includes(searchOlimpiada.toLowerCase()));
      const matchStatus = statusFilterOlimpiada === 'all' || e.certificate_status === statusFilterOlimpiada;
      const matchSubject = matchesSubjectFilter(e, subjectFilterOlimpiada);
      const matchOwner = ownerFilterOlimpiada === 'all' || e.created_by?.id === user?.id;
      return matchSearch && matchStatus && matchSubject && matchOwner;
    });

    // Ordenar: minhas olimpíadas primeiro
    return filtered.sort((a, b) => {
      const aIsMine = a.created_by?.id === user?.id ? 0 : 1;
      const bIsMine = b.created_by?.id === user?.id ? 0 : 1;
      if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      // Se ambas são minhas ou não, ordenar por data (mais recente primeiro)
      return getTimestamp(b.applied_at) - getTimestamp(a.applied_at);
    });
  }, [olimpiadas, searchOlimpiada, statusFilterOlimpiada, subjectFilterOlimpiada, ownerFilterOlimpiada, user?.id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <FileText className="h-3 w-3 mr-1" />
            Sem certificado
          </Badge>
        );
    }
  };

  const renderFilters = (
    search: string,
    setSearch: (value: string) => void,
    statusFilter: string,
    setStatusFilter: (value: string) => void,
    subjectFilter: string,
    setSubjectFilter: (value: string) => void,
    ownerFilter: string,
    setOwnerFilter: (value: string) => void,
    subjects: string[],
    placeholder: string,
    myCount: number,
    totalCount: number
  ) => (
    <div className="space-y-3 mb-4">
      {/* Filtro de proprietário */}
      <div className="flex gap-2">
        <button
          onClick={() => setOwnerFilter('mine')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            ownerFilter === 'mine'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted border-border'
          }`}
        >
          <User className="h-4 w-4" />
          Minhas ({myCount})
        </button>
        <button
          onClick={() => setOwnerFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            ownerFilter === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted border-border'
          }`}
        >
          <Users className="h-4 w-4" />
          Todas ({totalCount})
        </button>
      </div>

      {/* Filtros de busca e status */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="none">Sem certificado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
          </SelectContent>
        </Select>
        {subjects.length > 0 && (
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Disciplina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as disciplinas</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  // Função para formatar data de forma segura
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Data não informada';
    try {
      const date = new Date(dateString);
      // Verificar se a data é válida
      if (isNaN(date.getTime())) return 'Data não informada';
      return date.toLocaleDateString('pt-BR');
    } catch {
      return 'Data não informada';
    }
  };

  const renderEvaluationCard = (evaluation: EvaluationWithCertificates) => {
    const isMine = evaluation.created_by?.id === user?.id;
    
    return (
      <Card
        key={evaluation.id}
        className={`cursor-pointer hover:shadow-md transition-shadow ${isMine ? 'ring-2 ring-primary/20' : ''}`}
        onClick={() => onSelectEvaluation(evaluation.id, evaluation)}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="text-lg line-clamp-2">{evaluation.title}</CardTitle>
              {isMine && (
                <Badge variant="outline" className="mt-1 text-xs bg-primary/10 text-primary border-primary/20">
                  <User className="h-3 w-3 mr-1" />
                  Minha
                </Badge>
              )}
            </div>
            {getStatusBadge(evaluation.certificate_status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            <span>{evaluation.subject}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {evaluation.approved_certificates_count ?? 0} de {evaluation.total_students_count}{' '}
              certificados aprovados
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>
              {evaluation.total_students_count} aluno
              {evaluation.total_students_count !== 1 ? 's' : ''} elegíve
              {evaluation.total_students_count !== 1 ? 'is' : 'l'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Criada em: {formatDate(evaluation.applied_at)}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderEmptyState = (type: 'avaliacao' | 'olimpiada', hasFilters: boolean, ownerFilter: string) => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        {type === 'olimpiada' ? (
          <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
        ) : (
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        )}
        <p className="text-muted-foreground text-center">
          {hasFilters 
            ? `Nenhum${type === 'olimpiada' ? 'a olimpíada' : 'a avaliação'} encontrad${type === 'olimpiada' ? 'a' : 'a'} com os filtros aplicados.`
            : ownerFilter === 'mine'
              ? `Você ainda não criou nenhum${type === 'olimpiada' ? 'a olimpíada' : 'a avaliação'}.`
              : isAdmin 
                ? `Nenhum${type === 'olimpiada' ? 'a olimpíada' : 'a avaliação'} encontrad${type === 'olimpiada' ? 'a' : 'a'} no sistema.`
                : `Nenhum${type === 'olimpiada' ? 'a olimpíada' : 'a avaliação'} encontrad${type === 'olimpiada' ? 'a' : 'a'} para sua escola.`
          }
        </p>
      </CardContent>
    </Card>
  );

  const renderLoadingSkeleton = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-[300px]" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-[120px]" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        {renderLoadingSkeleton()}
      </div>
    );
  }

  const hasAvaliacaoFilters = searchAvaliacao !== '' || statusFilterAvaliacao !== 'all' || subjectFilterAvaliacao !== 'all';
  const hasOlimpiadaFilters = searchOlimpiada !== '' || statusFilterOlimpiada !== 'all' || subjectFilterOlimpiada !== 'all';

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'avaliacoes' | 'olimpiadas')} className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="avaliacoes" className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Avaliações ({avaliacoes.length})
        </TabsTrigger>
        <TabsTrigger value="olimpiadas" className="flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Olimpíadas ({olimpiadas.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="avaliacoes" className="space-y-4">
        {renderFilters(
          searchAvaliacao,
          setSearchAvaliacao,
          statusFilterAvaliacao,
          setStatusFilterAvaliacao,
          subjectFilterAvaliacao,
          setSubjectFilterAvaliacao,
          ownerFilterAvaliacao,
          setOwnerFilterAvaliacao,
          subjectsAvaliacao,
          'Buscar avaliação por título ou disciplina...',
          myAvaliacoesCount,
          avaliacoes.length
        )}
        
        {filteredAvaliacoes.length === 0 ? (
          renderEmptyState('avaliacao', hasAvaliacaoFilters, ownerFilterAvaliacao)
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAvaliacoes.map(renderEvaluationCard)}
          </div>
        )}
      </TabsContent>

      <TabsContent value="olimpiadas" className="space-y-4">
        {renderFilters(
          searchOlimpiada,
          setSearchOlimpiada,
          statusFilterOlimpiada,
          setStatusFilterOlimpiada,
          subjectFilterOlimpiada,
          setSubjectFilterOlimpiada,
          ownerFilterOlimpiada,
          setOwnerFilterOlimpiada,
          subjectsOlimpiada,
          'Buscar olimpíada por título ou disciplina...',
          myOlimpiadasCount,
          olimpiadas.length
        )}
        
        {filteredOlimpiadas.length === 0 ? (
          renderEmptyState('olimpiada', hasOlimpiadaFilters, ownerFilterOlimpiada)
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredOlimpiadas.map(renderEvaluationCard)}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
