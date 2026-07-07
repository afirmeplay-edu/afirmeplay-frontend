import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  downloadCertificatesBatch,
  type BulkDownloadProgress,
} from '@/utils/certificateBulkDownload';
import type { ApprovedStudent, CertificateBatchFilters } from '@/types/certificates';

const ALL_FILTER = 'all';
const NONE_FILTER = '__none__';

type BulkScope = 'all' | 'school' | 'grade' | 'class' | 'current';

interface FilterOption {
  id: string;
  name: string;
}

interface ScopeSelectFieldProps {
  label: string;
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: FilterOption[];
  className?: string;
}

function ScopeSelectField({
  label,
  id,
  value,
  onValueChange,
  placeholder,
  options,
  className,
}: ScopeSelectFieldProps) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface CertificateBulkDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluationId: string;
  evaluationTitle: string;
  brandingCityId?: string | null;
  students: ApprovedStudent[];
  lockedSchoolId?: string | null;
  currentFilters: {
    school: string;
    grade: string;
    class: string;
  };
  hasActiveFilters: boolean;
  schoolOptions: FilterOption[];
  gradeOptions: FilterOption[];
  classOptions: FilterOption[];
}

function uniqueOptions(
  items: ApprovedStudent[],
  getId: (s: ApprovedStudent) => string | null | undefined,
  getName: (s: ApprovedStudent) => string | null | undefined
): FilterOption[] {
  const map = new Map<string, string>();

  for (const item of items) {
    const id = getId(item);
    const name = getName(item);
    if (id) {
      map.set(id, name?.trim() || id);
    }
  }

  return Array.from(map.entries())
    .map(([id, label]) => ({ id, name: label }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function matchesScopeId(
  value: string | null | undefined,
  filterId: string | undefined
): boolean {
  if (!filterId) return true;
  if (filterId === NONE_FILTER) return !value;
  return value === filterId;
}

function countApprovedInScope(
  students: ApprovedStudent[],
  filters: {
    school_id?: string;
    grade_id?: string;
    class_id?: string;
  }
): number {
  return students.filter((student) => {
    if (student.certificate_status !== 'approved' || !student.certificate_id) {
      return false;
    }
    if (!matchesScopeId(student.school_id, filters.school_id)) return false;
    if (!matchesScopeId(student.grade_id, filters.grade_id)) return false;
    if (!matchesScopeId(student.class_id, filters.class_id)) return false;
    return true;
  }).length;
}

function buildApiFilters(
  scope: BulkScope,
  scopeSchool: string,
  scopeGrade: string,
  scopeClass: string,
  currentFilters: CertificateBulkDownloadDialogProps['currentFilters']
): CertificateBatchFilters {
  const base: CertificateBatchFilters = { status: 'approved' };

  if (scope === 'all') {
    return base;
  }

  if (scope === 'current') {
    if (currentFilters.school !== ALL_FILTER && currentFilters.school !== NONE_FILTER) {
      base.school_id = currentFilters.school;
    }
    if (currentFilters.grade !== ALL_FILTER && currentFilters.grade !== NONE_FILTER) {
      base.grade_id = currentFilters.grade;
    }
    if (currentFilters.class !== ALL_FILTER && currentFilters.class !== NONE_FILTER) {
      base.class_id = currentFilters.class;
    }
    return base;
  }

  if (scopeSchool !== ALL_FILTER) {
    base.school_id = scopeSchool;
  }
  if (scope === 'grade' && scopeGrade !== ALL_FILTER) {
    base.grade_id = scopeGrade;
  }
  if (scope === 'class') {
    if (scopeGrade !== ALL_FILTER) {
      base.grade_id = scopeGrade;
    }
    if (scopeClass !== ALL_FILTER) {
      base.class_id = scopeClass;
    }
  }

  return base;
}

function progressLabel(progress: BulkDownloadProgress): string {
  if (progress.phase === 'fetching') {
    return 'Buscando certificados...';
  }
  if (progress.phase === 'generating') {
    return `Gerando PDFs (${progress.current} de ${progress.total})...`;
  }
  return `Compactando ZIP (${progress.current} de ${progress.total})...`;
}

function progressPercent(progress: BulkDownloadProgress): number {
  if (progress.phase === 'fetching') {
    return 5;
  }
  if (progress.total === 0) {
    return 0;
  }
  const base = progress.phase === 'zipping' ? 85 : 10;
  const range = progress.phase === 'zipping' ? 15 : 75;
  return Math.min(100, base + (progress.current / progress.total) * range);
}

export function CertificateBulkDownloadDialog({
  open,
  onOpenChange,
  evaluationId,
  evaluationTitle,
  brandingCityId,
  students,
  lockedSchoolId,
  currentFilters,
  hasActiveFilters,
  schoolOptions,
}: CertificateBulkDownloadDialogProps) {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const [scope, setScope] = useState<BulkScope>('all');
  const [scopeSchool, setScopeSchool] = useState(ALL_FILTER);
  const [scopeGrade, setScopeGrade] = useState(ALL_FILTER);
  const [scopeClass, setScopeClass] = useState(ALL_FILTER);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<BulkDownloadProgress | null>(null);

  const approvedStudents = useMemo(
    () => students.filter((s) => s.certificate_status === 'approved' && s.certificate_id),
    [students]
  );

  const effectiveSchool = lockedSchoolId ?? scopeSchool;

  const studentsForGradeOptions = useMemo(() => {
    if (effectiveSchool === ALL_FILTER) return approvedStudents;
    return approvedStudents.filter((s) => s.school_id === effectiveSchool);
  }, [approvedStudents, effectiveSchool]);

  const dialogGradeOptions = useMemo(
    () =>
      uniqueOptions(
        studentsForGradeOptions,
        (s) => s.grade_id,
        (s) => s.grade_name
      ),
    [studentsForGradeOptions]
  );

  const studentsForClassOptions = useMemo(() => {
    if (scopeGrade === ALL_FILTER) return studentsForGradeOptions;
    return studentsForGradeOptions.filter((s) => s.grade_id === scopeGrade);
  }, [studentsForGradeOptions, scopeGrade]);

  const dialogClassOptions = useMemo(
    () =>
      uniqueOptions(
        studentsForClassOptions,
        (s) => s.class_id,
        (s) => s.class_name
      ),
    [studentsForClassOptions]
  );

  const apiFilters = useMemo(
    () => buildApiFilters(scope, effectiveSchool, scopeGrade, scopeClass, currentFilters),
    [scope, effectiveSchool, scopeGrade, scopeClass, currentFilters]
  );

  const estimatedCount = useMemo(() => {
    if (scope === 'current') {
      return countApprovedInScope(approvedStudents, {
        school_id: currentFilters.school !== ALL_FILTER ? currentFilters.school : undefined,
        grade_id: currentFilters.grade !== ALL_FILTER ? currentFilters.grade : undefined,
        class_id: currentFilters.class !== ALL_FILTER ? currentFilters.class : undefined,
      });
    }
    return countApprovedInScope(approvedStudents, apiFilters);
  }, [scope, approvedStudents, apiFilters, currentFilters]);

  const showSchoolScope = !lockedSchoolId && schoolOptions.length > 1;
  const showGradeScope = dialogGradeOptions.length > 1;
  const showClassScope = dialogClassOptions.length > 1;

  const canDownload =
    !isDownloading &&
    estimatedCount > 0 &&
    (scope !== 'school' || effectiveSchool !== ALL_FILTER) &&
    (scope !== 'grade' || (effectiveSchool !== ALL_FILTER && scopeGrade !== ALL_FILTER)) &&
    (scope !== 'class' ||
      (effectiveSchool !== ALL_FILTER && scopeGrade !== ALL_FILTER && scopeClass !== ALL_FILTER));

  useEffect(() => {
    if (!open) {
      setScope('all');
      setScopeSchool(lockedSchoolId ?? ALL_FILTER);
      setScopeGrade(ALL_FILTER);
      setScopeClass(ALL_FILTER);
      setProgress(null);
    }
  }, [open, lockedSchoolId]);

  useEffect(() => {
    if (lockedSchoolId) {
      setScopeSchool(lockedSchoolId);
    }
  }, [lockedSchoolId]);

  const handleScopeSchoolChange = (value: string) => {
    setScopeSchool(value);
    setScopeGrade(ALL_FILTER);
    setScopeClass(ALL_FILTER);
  };

  const handleScopeGradeChange = (value: string) => {
    setScopeGrade(value);
    setScopeClass(ALL_FILTER);
  };

  const handleClose = (nextOpen: boolean) => {
    if (isDownloading) return;
    onOpenChange(nextOpen);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgress({ phase: 'fetching', current: 0, total: 1 });
    abortRef.current = new AbortController();

    const needsClientFilter =
      scope === 'current' &&
      (currentFilters.school === NONE_FILTER ||
        currentFilters.grade === NONE_FILTER ||
        currentFilters.class === NONE_FILTER);

    try {
      await downloadCertificatesBatch({
        evaluationId,
        evaluationTitle,
        filters: apiFilters,
        brandingCityId,
        onProgress: setProgress,
        signal: abortRef.current.signal,
        clientFilter: needsClientFilter
          ? (item) =>
              matchesScopeId(
                item.school_id,
                currentFilters.school !== ALL_FILTER ? currentFilters.school : undefined
              ) &&
              matchesScopeId(
                item.grade_id,
                currentFilters.grade !== ALL_FILTER ? currentFilters.grade : undefined
              ) &&
              matchesScopeId(
                item.class_id,
                currentFilters.class !== ALL_FILTER ? currentFilters.class : undefined
              )
          : undefined,
      });

      toast({
        title: 'Download concluído',
        description:
          estimatedCount === 1
            ? 'O certificado foi salvo no seu dispositivo.'
            : `${estimatedCount} certificados foram compactados e salvos.`,
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast({
          title: 'Download cancelado',
          description: 'A geração dos certificados foi interrompida.',
        });
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível baixar os certificados.';
      toast({
        title: 'Erro no download',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-none overflow-y-visible overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Baixar certificados em lote</DialogTitle>
          <DialogDescription>
            Selecione o escopo do download. Os PDFs serão gerados no navegador e
            organizados por escola, série e turma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value as BulkScope)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3"
            disabled={isDownloading}
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="font-normal leading-snug cursor-pointer">
                Todos os aprovados ({approvedStudents.length})
              </Label>
            </div>

            {showSchoolScope && (
              <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="school" id="scope-school" />
                  <Label htmlFor="scope-school" className="font-normal leading-snug cursor-pointer">
                    Por escola
                  </Label>
                </div>
                {scope === 'school' && (
                  <ScopeSelectField
                    id="bulk-scope-school"
                    label="Escola"
                    value={scopeSchool}
                    onValueChange={handleScopeSchoolChange}
                    placeholder="Selecione a escola"
                    options={schoolOptions}
                    className="w-full sm:max-w-md"
                  />
                )}
              </div>
            )}

            {(showSchoolScope || lockedSchoolId) && showGradeScope && (
              <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="grade" id="scope-grade" />
                  <Label htmlFor="scope-grade" className="font-normal leading-snug cursor-pointer">
                    Por série
                  </Label>
                </div>
                {scope === 'grade' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {showSchoolScope && (
                      <ScopeSelectField
                        id="bulk-scope-grade-school"
                        label="Escola"
                        value={scopeSchool}
                        onValueChange={handleScopeSchoolChange}
                        placeholder="Selecione a escola"
                        options={schoolOptions}
                      />
                    )}
                    <ScopeSelectField
                      id="bulk-scope-grade"
                      label="Série"
                      value={scopeGrade}
                      onValueChange={handleScopeGradeChange}
                      placeholder="Selecione a série"
                      options={dialogGradeOptions}
                      className={showSchoolScope ? '' : 'sm:max-w-xs'}
                    />
                  </div>
                )}
              </div>
            )}

            {(showSchoolScope || lockedSchoolId) && showClassScope && (
              <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="class" id="scope-class" />
                  <Label htmlFor="scope-class" className="font-normal leading-snug cursor-pointer">
                    Por turma
                  </Label>
                </div>
                {scope === 'class' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {showSchoolScope && (
                      <ScopeSelectField
                        id="bulk-scope-class-school"
                        label="Escola"
                        value={scopeSchool}
                        onValueChange={handleScopeSchoolChange}
                        placeholder="Selecione a escola"
                        options={schoolOptions}
                      />
                    )}
                    <ScopeSelectField
                      id="bulk-scope-class-grade"
                      label="Série"
                      value={scopeGrade}
                      onValueChange={handleScopeGradeChange}
                      placeholder="Selecione a série"
                      options={dialogGradeOptions}
                    />
                    <ScopeSelectField
                      id="bulk-scope-class"
                      label="Turma"
                      value={scopeClass}
                      onValueChange={setScopeClass}
                      placeholder="Selecione a turma"
                      options={dialogClassOptions}
                    />
                  </div>
                )}
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center gap-3 sm:col-span-2">
                <RadioGroupItem value="current" id="scope-current" />
                <Label htmlFor="scope-current" className="font-normal leading-snug cursor-pointer">
                  Recorte atual dos filtros (
                  {countApprovedInScope(approvedStudents, {
                    school_id:
                      currentFilters.school !== ALL_FILTER ? currentFilters.school : undefined,
                    grade_id:
                      currentFilters.grade !== ALL_FILTER ? currentFilters.grade : undefined,
                    class_id:
                      currentFilters.class !== ALL_FILTER ? currentFilters.class : undefined,
                  })}
                  )
                </Label>
              </div>
            )}
          </RadioGroup>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {estimatedCount === 0
                ? 'Nenhum certificado aprovado neste escopo.'
                : estimatedCount === 1
                  ? '1 certificado será gerado em PDF.'
                  : `${estimatedCount} certificados serão gerados e compactados em ZIP.`}
            </p>

            {isDownloading && progress && (
              <div className="w-full sm:max-w-xs space-y-2 shrink-0">
                <p className="text-sm">{progressLabel(progress)}</p>
                <Progress value={progressPercent(progress)} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isDownloading ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
          <Button onClick={handleDownload} disabled={!canDownload}>
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
