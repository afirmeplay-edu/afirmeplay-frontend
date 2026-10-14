import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileImage,
  FileText,
  Info,
  Loader2,
  ScanLine,
  TriangleAlert,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/context/authContext';
import type { Question } from '@/types/forms';
import { canGenerateFormPrintPackage } from '@/services/formPrintPackagesApi';
import {
  buildQuestionLabelMap,
  correctFormAnswerSheets,
  CORNER_SQUARES_SKIP_REASON,
  type FormAnswerSheetCorrectionResult,
  type FormAnswerSheetPageIssue,
  type FormAnswerSheetStudentCorrection,
} from '@/services/formAnswerSheetCorrectionsApi';

interface CorrectionFormData {
  id: string;
  title?: string;
  customTitle?: string;
  name?: string;
  nome?: string;
  formType: string;
  createdBy?: { id?: string; name?: string } | string;
  createdById?: string;
  questions?: Question[];
}

type StudentStatus = 'not-saved' | 'with-issues' | 'saved';

const ACCEPTED_TYPES = 'application/pdf,image/*';

const fileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

const isAcceptedFile = (file: File) =>
  file.type === 'application/pdf' || file.type.startsWith('image/') || /\.pdf$/i.test(file.name);

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const getStudentStatus = (student: FormAnswerSheetStudentCorrection): StudentStatus => {
  if (!student.saved) return 'not-saved';
  const hasIssues =
    student.blank.length > 0 ||
    student.invalid.length > 0 ||
    student.conflicts.length > 0 ||
    student.missingPages.length > 0;
  return hasIssues ? 'with-issues' : 'saved';
};

const STATUS_ORDER: Record<StudentStatus, number> = { 'not-saved': 0, 'with-issues': 1, saved: 2 };

const StatusBadge = ({ status }: { status: StudentStatus }) => {
  if (status === 'not-saved') {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Não gravado
      </Badge>
    );
  }
  if (status === 'with-issues') {
    return (
      <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-300">
        <TriangleAlert className="mr-1 h-3 w-3" />
        Gravado com pendências
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-400/60 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Gravado
    </Badge>
  );
};

const QuestionIdList = ({
  title,
  ids,
  labels,
}: {
  title: string;
  ids: string[];
  labels: Map<string, string>;
}) => {
  if (ids.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-foreground">
        {title} ({ids.length})
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {ids.map((qid) => (
          <li key={qid}>{labels.get(qid) ?? qid}</li>
        ))}
      </ul>
    </div>
  );
};

const FormAnswerSheetCorrection = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState<CorrectionFormData | null>(null);
  const [isLoadingForm, setIsLoadingForm] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<FormAnswerSheetCorrectionResult | null>(null);
  const [submittedFiles, setSubmittedFiles] = useState<File[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoadingForm(true);
    api
      .get(`/forms/${id}`, { params: { includeQuestions: true } })
      .then((response) => {
        if (!cancelled) setFormData(response.data?.data ?? response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err?.response?.data?.error || 'Não foi possível carregar o questionário.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingForm(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const questionLabels = useMemo(() => buildQuestionLabelMap(formData?.questions), [formData?.questions]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      const accepted = list.filter(isAcceptedFile);
      const rejected = list.length - accepted.length;
      if (rejected > 0) {
        toast({
          title: `${rejected} arquivo${rejected !== 1 ? 's' : ''} ignorado${rejected !== 1 ? 's' : ''}`,
          description: 'Envie apenas PDFs ou imagens do cartão.',
          variant: 'destructive',
        });
      }
      setFiles((prev) => {
        const keys = new Set(prev.map(fileKey));
        return [...prev, ...accepted.filter((f) => !keys.has(fileKey(f)))];
      });
    },
    [toast],
  );

  const removeFile = (key: string) => setFiles((prev) => prev.filter((f) => fileKey(f) !== key));

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isSubmitting) return;
    addFiles(event.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (!id || files.length === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const sending = files;
    try {
      const data = await correctFormAnswerSheets(id, sending);
      setResult(data);
      setSubmittedFiles(sending);
      setFiles([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível corrigir os cartões.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileLabel = (issue: Pick<FormAnswerSheetPageIssue, 'fileIndex' | 'filename'>) =>
    issue.filename || submittedFiles[issue.fileIndex]?.name || `Arquivo ${issue.fileIndex + 1}`;

  const sortedStudents = useMemo(
    () =>
      [...(result?.students ?? [])].sort(
        (a, b) => STATUS_ORDER[getStudentStatus(a)] - STATUS_ORDER[getStudentStatus(b)],
      ),
    [result],
  );

  const summary = useMemo(() => {
    const counts = { saved: 0, 'with-issues': 0, 'not-saved': 0 } as Record<StudentStatus, number>;
    result?.students.forEach((s) => {
      counts[getStudentStatus(s)] += 1;
    });
    const cornerSkips = result?.skipped.filter((s) => s.reason === CORNER_SQUARES_SKIP_REASON) ?? [];
    const otherSkips = result?.skipped.filter((s) => s.reason !== CORNER_SQUARES_SKIP_REASON) ?? [];
    return { counts, cornerSkips, otherSkips };
  }, [result]);

  const backButton = (
    <Button variant="outline" size="sm" onClick={() => navigate('/app/questionarios/cadastro')}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      Voltar
    </Button>
  );

  if (isLoadingForm) {
    return (
      <div className="container mx-auto space-y-4 px-3 py-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-56" />
          {backButton}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadError || !formData) {
    return (
      <div className="container mx-auto space-y-4 px-3 py-4 sm:p-6">
        <div className="flex justify-end">{backButton}</div>
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">{loadError || 'Questionário não encontrado.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formTitle = formData.customTitle || formData.title || formData.name || formData.nome || 'Questionário';

  if (!canGenerateFormPrintPackage(formData, user)) {
    return (
      <div className="container mx-auto space-y-4 px-3 py-4 sm:p-6">
        <div className="flex justify-end">{backButton}</div>
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              A correção de cartões está disponível só para questionários de aluno e para o admin ou
              técnico administrativo que criou o questionário.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <ScanLine className="h-6 w-6 shrink-0 text-primary" />
            Corrigir cartões
          </h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{formTitle}</p>
        </div>
        {backButton}
      </div>

      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="text-base">Arquivos</CardTitle>
          <CardDescription className="text-xs">
            Envie o PDF inteiro de cada aluno, só as folhas do cartão ou fotos das folhas. As páginas de um
            mesmo aluno são juntadas mesmo vindo de arquivos diferentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <div
            role="button"
            tabIndex={0}
            aria-disabled={isSubmitting}
            onClick={() => !isSubmitting && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isSubmitting) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isSubmitting) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            } ${isSubmitting ? 'pointer-events-none opacity-60' : ''}`}
          >
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste os arquivos aqui ou clique para escolher</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG ou WebP. Pode enviar vários de uma vez.</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {files.map((file) => {
                const key = fileKey(file);
                const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
                return (
                  <li key={key} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {isPdf ? (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatSize(file.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => removeFile(key)}
                      disabled={isSubmitting}
                      aria-label={`Remover ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{submitError}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSubmit} disabled={files.length === 0 || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="mr-1.5 h-4 w-4" />
              )}
              {isSubmitting
                ? 'Corrigindo cartões…'
                : files.length > 0
                  ? `Corrigir ${files.length} arquivo${files.length !== 1 ? 's' : ''}`
                  : 'Corrigir cartões'}
            </Button>
            {files.length > 0 && !isSubmitting && (
              <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                Limpar lista
              </Button>
            )}
            {isSubmitting && (
              <span className="text-xs text-muted-foreground">
                Arquivos grandes podem levar alguns minutos. Não feche esta página.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-base">Resultado da correção</CardTitle>
            <CardDescription className="text-xs">
              {result.fileCount} arquivo{result.fileCount !== 1 ? 's' : ''} recebido
              {result.fileCount !== 1 ? 's' : ''}, {result.students.length} aluno
              {result.students.length !== 1 ? 's' : ''} encontrado{result.students.length !== 1 ? 's' : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Gravados</p>
                <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {summary.counts.saved}
                </p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Gravados com pendências</p>
                <p className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {summary.counts['with-issues']}
                </p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Não gravados</p>
                <p className="text-xl font-semibold tabular-nums text-destructive">
                  {summary.counts['not-saved']}
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {result.errors.length} folha{result.errors.length !== 1 ? 's' : ''} ou arquivo
                  {result.errors.length !== 1 ? 's' : ''} com erro
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-destructive/90">
                  {result.errors.map((err, i) => (
                    <li key={`${err.fileIndex}-${err.pageIndex ?? 'f'}-${i}`}>
                      <span className="font-medium">{fileLabel(err)}</span>
                      {err.pageIndex != null && `, página ${err.pageIndex + 1}`}: {err.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.otherSkips.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="h-4 w-4" />
                  {summary.otherSkips.length} página{summary.otherSkips.length !== 1 ? 's' : ''} não lida
                  {summary.otherSkips.length !== 1 ? 's' : ''}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-amber-900/90 dark:text-amber-200/90">
                  {summary.otherSkips.map((skip, i) => (
                    <li key={`${skip.fileIndex}-${skip.pageIndex ?? 'f'}-${i}`}>
                      <span className="font-medium">{fileLabel(skip)}</span>
                      {skip.pageIndex != null && `, página ${skip.pageIndex + 1}`}: {skip.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.cornerSkips.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {summary.cornerSkips.length} página{summary.cornerSkips.length !== 1 ? 's' : ''} sem
                cartão foram ignoradas. Normalmente são as páginas do questionário.
              </p>
            )}

            {sortedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cartão foi reconhecido nos arquivos enviados.
              </p>
            ) : (
              <Accordion type="multiple" className="rounded-lg border border-border">
                {sortedStudents.map((student) => {
                  const status = getStudentStatus(student);
                  const name = student.studentName || `Aluno ${student.studentPrefix}`;
                  const answerEntries = Object.entries(student.answers ?? {});
                  const fileNames = student.files.map(
                    (i) => submittedFiles[i]?.name ?? `Arquivo ${i + 1}`,
                  );
                  return (
                    <AccordionItem
                      key={student.studentId ?? student.studentPrefix}
                      value={student.studentId ?? student.studentPrefix}
                      className="px-3 last:border-b-0"
                    >
                      <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
                          <StatusBadge status={status} />
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        {!student.saved && student.reason && (
                          <p className="text-sm text-destructive">Motivo: {student.reason}</p>
                        )}
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <p>Arquivos: {fileNames.join(', ') || '—'}</p>
                          <p>
                            Páginas do cartão lidas: {student.pages.join(', ') || '—'}
                            {student.missingPages.length > 0 && (
                              <span className="text-amber-700 dark:text-amber-300">
                                {' '}
                                · faltando: {student.missingPages.join(', ')}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <QuestionIdList title="Em branco" ids={student.blank} labels={questionLabels} />
                          <QuestionIdList title="Inválidas" ids={student.invalid} labels={questionLabels} />
                          <QuestionIdList title="Em conflito" ids={student.conflicts} labels={questionLabels} />
                        </div>
                        {answerEntries.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-foreground">
                              Respostas lidas ({answerEntries.length})
                            </p>
                            <dl className="mt-1 divide-y divide-border rounded-md border border-border text-xs">
                              {answerEntries.map(([qid, value]) => (
                                <div key={qid} className="flex flex-col gap-0.5 px-2.5 py-1.5 sm:flex-row sm:gap-3">
                                  <dt className="text-muted-foreground sm:w-2/3">{questionLabels.get(qid) ?? qid}</dt>
                                  <dd className="font-medium text-foreground sm:w-1/3">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FormAnswerSheetCorrection;
