import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, ChevronDown, Clock, Download, FileText, Printer, User } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CertificateViewer } from '@/components/certificates/CertificateViewer';
import { CertificateBulkDownloadDialog } from '@/components/certificates/CertificateBulkDownloadDialog';
import { CertificatesApiService } from '@/services/certificatesApi';
import { CertificateStatsBadges } from '@/components/certificates/CertificateStatsBadges';
import { getCertificateStats } from '@/utils/certificateStats';
import type { ApprovedStudent, Certificate } from '@/types/certificates';

const ALL_FILTER = 'all';
const NONE_FILTER = '__none__';
const COLLAPSE_THRESHOLD = 8;

interface FilterOption {
  id: string;
  name: string;
}

interface StudentListProps {
  evaluationId: string;
  evaluationTitle: string;
  brandingCityId?: string | null;
  refreshKey?: number;
  lockedSchoolId?: string | null;
  onSelectStudent?: (studentId: string) => void;
}

function uniqueOptions(
  items: ApprovedStudent[],
  getId: (s: ApprovedStudent) => string | null | undefined,
  getName: (s: ApprovedStudent) => string | null | undefined,
  noneLabel: string
): FilterOption[] {
  const map = new Map<string, string>();
  let hasNone = false;

  for (const item of items) {
    const id = getId(item);
    const name = getName(item);
    if (id) {
      map.set(id, name?.trim() || id);
    } else {
      hasNone = true;
    }
  }

  const options = Array.from(map.entries())
    .map(([id, label]) => ({ id, name: label }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  if (hasNone) {
    options.push({ id: NONE_FILTER, name: noneLabel });
  }

  return options;
}

function matchesFilter(value: string | null | undefined, filter: string): boolean {
  if (filter === ALL_FILTER) return true;
  if (filter === NONE_FILTER) return !value;
  return value === filter;
}

export function StudentList({
  evaluationId,
  evaluationTitle,
  brandingCityId,
  refreshKey,
  lockedSchoolId,
  onSelectStudent,
}: StudentListProps) {
  const { toast } = useToast();
  const [students, setStudents] = useState<ApprovedStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [loadingCertificateId, setLoadingCertificateId] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState(ALL_FILTER);
  const [gradeFilter, setGradeFilter] = useState(ALL_FILTER);
  const [classFilter, setClassFilter] = useState(ALL_FILTER);
  const [isListExpanded, setIsListExpanded] = useState(false);

  useEffect(() => {
    const loadStudents = async () => {
      if (!evaluationId) return;

      setIsLoading(true);
      try {
        const data = await CertificatesApiService.getApprovedStudents(evaluationId);
        setStudents(data);
      } catch {
        // silencioso — lista vazia
      } finally {
        setIsLoading(false);
      }
    };

    loadStudents();
  }, [evaluationId, refreshKey]);

  useEffect(() => {
    if (lockedSchoolId) {
      setSchoolFilter(lockedSchoolId);
    } else {
      setSchoolFilter(ALL_FILTER);
    }
    setGradeFilter(ALL_FILTER);
    setClassFilter(ALL_FILTER);
    setIsListExpanded(false);
  }, [evaluationId, refreshKey, lockedSchoolId]);

  useEffect(() => {
    if (!isLoading && students.length > 0 && students.length <= COLLAPSE_THRESHOLD) {
      setIsListExpanded(true);
    }
  }, [isLoading, students.length, evaluationId]);

  const schoolOptions = useMemo(
    () =>
      uniqueOptions(
        students,
        (s) => s.school_id,
        (s) => s.school_name,
        'Sem escola'
      ),
    [students]
  );

  const studentsForGradeOptions = useMemo(() => {
    if (schoolFilter === ALL_FILTER) return students;
    if (schoolFilter === NONE_FILTER) {
      return students.filter((s) => !s.school_id);
    }
    return students.filter((s) => s.school_id === schoolFilter);
  }, [students, schoolFilter]);

  const gradeOptions = useMemo(
    () =>
      uniqueOptions(
        studentsForGradeOptions,
        (s) => s.grade_id,
        (s) => s.grade_name,
        'Sem série'
      ),
    [studentsForGradeOptions]
  );

  const studentsForClassOptions = useMemo(() => {
    let list = studentsForGradeOptions;
    if (gradeFilter === NONE_FILTER) {
      list = list.filter((s) => !s.grade_id);
    } else if (gradeFilter !== ALL_FILTER) {
      list = list.filter((s) => s.grade_id === gradeFilter);
    }
    return list;
  }, [studentsForGradeOptions, gradeFilter]);

  const classOptions = useMemo(
    () =>
      uniqueOptions(
        studentsForClassOptions,
        (s) => s.class_id,
        (s) => s.class_name,
        'Sem turma'
      ),
    [studentsForClassOptions]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const schoolMatch =
        lockedSchoolId != null
          ? student.school_id === lockedSchoolId || (!student.school_id && lockedSchoolId === NONE_FILTER)
          : matchesFilter(student.school_id, schoolFilter);

      const gradeMatch = matchesFilter(student.grade_id, gradeFilter);
      const classMatch = matchesFilter(student.class_id, classFilter);

      return schoolMatch && gradeMatch && classMatch;
    });
  }, [students, schoolFilter, gradeFilter, classFilter, lockedSchoolId]);

  const showSchoolFilter = !lockedSchoolId && schoolOptions.length > 1;
  const showGradeFilter = gradeOptions.length > 1;
  const showClassFilter = classOptions.length > 1;
  const showFilters = showSchoolFilter || showGradeFilter || showClassFilter;

  const hasActiveFilters =
    (showSchoolFilter && schoolFilter !== ALL_FILTER) ||
    gradeFilter !== ALL_FILTER ||
    classFilter !== ALL_FILTER;

  const totalStats = useMemo(() => getCertificateStats(students), [students]);
  const filteredStats = useMemo(
    () => getCertificateStats(filteredStudents),
    [filteredStudents]
  );

  const getStatusBadge = (status: ApprovedStudent['certificate_status']) => {
    if (status === 'approved') {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Certificado Aprovado
        </Badge>
      );
    }
    if (status === 'pending') {
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <FileText className="h-3 w-3 mr-1" />
        Não emitido
      </Badge>
    );
  };

  const canViewCertificate = (student: ApprovedStudent) =>
    student.certificate_status === 'approved' && !!student.certificate_id;

  const handleViewCertificate = async (student: ApprovedStudent) => {
    if (!student.certificate_id) return;

    setLoadingCertificateId(student.id);
    try {
      const certificate = await CertificatesApiService.getCertificate(student.certificate_id);

      if (!certificate) {
        toast({
          title: 'Erro',
          description: 'Certificado não encontrado para este aluno.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedCertificate(certificate);
      setIsViewerOpen(true);
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o certificado.',
        variant: 'destructive',
      });
    } finally {
      setLoadingCertificateId(null);
    }
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setSelectedCertificate(null);
  };

  const handleSchoolChange = (value: string) => {
    setSchoolFilter(value);
    setGradeFilter(ALL_FILTER);
    setClassFilter(ALL_FILTER);
  };

  const handleGradeChange = (value: string) => {
    setGradeFilter(value);
    setClassFilter(ALL_FILTER);
  };

  const hasViewableCertificates = filteredStudents.some(canViewCertificate);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <User className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nenhum aluno participante encontrado nesta avaliação.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Collapsible open={isListExpanded} onOpenChange={setIsListExpanded}>
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex flex-1 items-start gap-2 text-left rounded-md hover:bg-muted/50 -m-1 p-1 transition-colors"
                    >
                      <ChevronDown
                        className={cn(
                          'h-5 w-5 shrink-0 mt-0.5 text-muted-foreground transition-transform duration-200',
                          isListExpanded && 'rotate-180'
                        )}
                      />
                      <div className="space-y-2 min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                          <User className="h-5 w-5 shrink-0" />
                          Alunos Participantes ({filteredStudents.length}
                          {filteredStudents.length !== students.length ? ` de ${students.length}` : ''})
                        </CardTitle>
                        {!isListExpanded && (
                          <p className="text-xs text-muted-foreground font-normal">
                            Lista recolhida — clique para expandir e ver os alunos
                          </p>
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                </div>

                {students.length > 0 && (
                  <div className="space-y-2 pl-7">
                    <CertificateStatsBadges stats={filteredStats} compact />
                    {hasActiveFilters && (
                      <p className="text-xs text-muted-foreground">
                        {filteredStats.approved} aprovado{filteredStats.approved !== 1 ? 's' : ''} neste
                        recorte ({totalStats.approved} de {totalStats.total} no total da avaliação)
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0 pl-7 sm:pl-0">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {isListExpanded ? 'Recolher' : 'Expandir'}
                  </Button>
                </CollapsibleTrigger>
                {totalStats.approved > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsBulkDialogOpen(true)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar em lote
                  </Button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 pl-7 sm:pl-0">
              {showSchoolFilter && (
                <Select value={schoolFilter} onValueChange={handleSchoolChange}>
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Escola" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todas as escolas</SelectItem>
                    {schoolOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {showGradeFilter && (
                <Select value={gradeFilter} onValueChange={handleGradeChange}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Série" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todas as séries</SelectItem>
                    {gradeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {showClassFilter && (
                <Select
                  value={classFilter}
                  onValueChange={setClassFilter}
                  disabled={gradeOptions.length > 1 && gradeFilter === ALL_FILTER}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Turma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todas as turmas</SelectItem>
                    {classOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            )}
          </CardHeader>

          <CollapsibleContent>
            <CardContent>
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum aluno encontrado com os filtros selecionados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      {showSchoolFilter && <TableHead>Escola</TableHead>}
                      {showGradeFilter && <TableHead>Série</TableHead>}
                      <TableHead>Turma</TableHead>
                      <TableHead className="text-center">Nota</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      {(hasViewableCertificates || onSelectStudent) && (
                        <TableHead className="text-right">Ações</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        {showSchoolFilter && (
                          <TableCell>{student.school_name || '—'}</TableCell>
                        )}
                        {showGradeFilter && (
                          <TableCell>{student.grade_name || '—'}</TableCell>
                        )}
                        <TableCell>{student.class_name || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-base">
                            {student.grade.toFixed(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(student.certificate_status)}
                        </TableCell>
                        {(hasViewableCertificates || onSelectStudent) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {canViewCertificate(student) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={loadingCertificateId === student.id}
                                  onClick={() => handleViewCertificate(student)}
                                >
                                  <Printer className="h-4 w-4 mr-1" />
                                  {loadingCertificateId === student.id ? 'Carregando...' : 'Visualizar'}
                                </Button>
                              )}
                              {onSelectStudent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onSelectStudent(student.id)}
                                >
                                  Ver Detalhes
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {selectedCertificate && (
        <CertificateViewer
          certificate={selectedCertificate}
          isOpen={isViewerOpen}
          onClose={handleCloseViewer}
          brandingCityId={brandingCityId}
        />
      )}

      <CertificateBulkDownloadDialog
        open={isBulkDialogOpen}
        onOpenChange={setIsBulkDialogOpen}
        evaluationId={evaluationId}
        evaluationTitle={evaluationTitle}
        brandingCityId={brandingCityId}
        students={students}
        lockedSchoolId={lockedSchoolId}
        currentFilters={{
          school: schoolFilter,
          grade: gradeFilter,
          class: classFilter,
        }}
        hasActiveFilters={hasActiveFilters}
        schoolOptions={schoolOptions}
        gradeOptions={gradeOptions}
        classOptions={classOptions}
      />
    </>
  );
}
