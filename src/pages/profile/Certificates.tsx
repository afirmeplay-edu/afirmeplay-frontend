import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/authContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeft, Award, CheckCircle2, Download, Info, Upload, Loader2 } from 'lucide-react';
import { CertificateList } from '@/components/certificates/CertificateList';
import { StudentList } from '@/components/certificates/StudentList';
import { CertificateStatsBadges } from '@/components/certificates/CertificateStatsBadges';
import { CertificateCustomizer } from '@/components/certificates/CertificateCustomizer';
import { CertificateTemplateComponent } from '@/components/certificates/CertificateTemplate';
import { CertificateRanking } from '@/components/certificates/CertificateRanking';
import { CertificatesApiService } from '@/services/certificatesApi';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import { getCertificateStats, getStudentsAwaitingApproval } from '@/utils/certificateStats';
import type { CertificateTemplate, ApprovedStudent, EvaluationWithCertificates } from '@/types/certificates';
import type { CertificateArtwork } from '@/types/certificate-artwork';
import { CertificateArtworksApiService } from '@/services/certificateArtworksApi';
import {
  buildPreviewCertificate,
  certificatePdfFilename,
  downloadCertificatePdf,
} from '@/services/certificatePdfService';

export default function Certificates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedEvaluation, setSelectedEvaluation] = useState<string | null>(null);
  const [selectedEvaluationData, setSelectedEvaluationData] = useState<EvaluationWithCertificates | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [municipalityId, setMunicipalityId] = useState<string | null>(null);
  const [students, setStudents] = useState<ApprovedStudent[]>([]);
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [studentListRefreshKey, setStudentListRefreshKey] = useState(0);
  const [artworks, setArtworks] = useState<CertificateArtwork[]>([]);
  const [isArtworkLoading, setIsArtworkLoading] = useState(false);
  const [isArtworkUploading, setIsArtworkUploading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [previewStudentId, setPreviewStudentId] = useState('');
  const [previewStudentName, setPreviewStudentName] = useState('');

  // Verificar se o usuário é o criador da avaliação
  const isEvaluationCreator = selectedEvaluationData?.created_by?.id === user.id;

  const certificateStats = useMemo(() => getCertificateStats(students), [students]);
  const studentsAwaitingApproval = useMemo(
    () => getStudentsAwaitingApproval(students),
    [students]
  );

  const canShowApproveButton =
    !!template && students.length > 0 && isEvaluationCreator;

  const isApproveDisabled =
    isApproving || studentsAwaitingApproval.length === 0;

  const approveDisabledReason = useMemo(() => {
    if (!canShowApproveButton) return null;
    if (isApproving) return null;
    if (studentsAwaitingApproval.length === 0) {
      return 'Todos os certificados elegíveis desta avaliação já foram aprovados.';
    }
    return null;
  }, [canShowApproveButton, isApproving, studentsAwaitingApproval.length]);

  useEffect(() => {
    const loadHierarchy = async () => {
      if (!user.id) return;
      
      setIsLoadingHierarchy(true);
      try {
        const hierarchy = await getUserHierarchyContext(user.id, user.role);
        
        if (hierarchy.school?.id) {
          setSchoolId(hierarchy.school.id);
        }
        
        if (hierarchy.municipality?.id) {
          setMunicipalityId(hierarchy.municipality.id);
        }
      } catch (error) {
        console.error('Erro ao carregar hierarquia:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar informações da escola.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };

    loadHierarchy();
  }, [user.id, user.role, toast]);

  useEffect(() => {
    let cancelled = false;

    const loadTemplateAndStudents = async () => {
      if (!selectedEvaluation) return;

      try {
        const [templateData, studentsData] = await Promise.all([
          CertificatesApiService.getCertificateTemplate(selectedEvaluation),
          CertificatesApiService.getApprovedStudents(selectedEvaluation)
        ]);

        if (cancelled) return;
        setTemplate(templateData || null);
        setStudents(studentsData);
      } catch (error) {
        if (cancelled) return;
        console.error('Erro ao carregar dados:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os dados da avaliação.',
          variant: 'destructive',
        });
      }
    };

    loadTemplateAndStudents();
    return () => {
      cancelled = true;
    };
  }, [selectedEvaluation, toast]);

  useEffect(() => {
    if (!selectedEvaluation) return;
    setIsArtworkLoading(true);
    CertificateArtworksApiService.list(selectedEvaluation)
      .then(setArtworks)
      .catch(() => setArtworks([]))
      .finally(() => setIsArtworkLoading(false));
  }, [selectedEvaluation]);

  const handleArtworkUpload = async (file?: File) => {
    if (!selectedEvaluation || !file) return;
    setIsArtworkUploading(true);
    try {
      const artwork = await CertificateArtworksApiService.upload(selectedEvaluation, file);
      setArtworks((current) => [artwork, ...current]);
      toast({ title: 'Modelo enviado', description: 'O modelo A4 paisagem foi armazenado como rascunho.' });
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar modelo',
        description: error?.response?.data?.erro || 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    } finally {
      setIsArtworkUploading(false);
    }
  };

  const previewStudent = useMemo(
    () => students.find((student) => student.id === previewStudentId) ?? null,
    [students, previewStudentId]
  );

  useEffect(() => {
    setPreviewStudentId('');
    setPreviewStudentName('');
    setStudents([]);
  }, [selectedEvaluation]);

  useEffect(() => {
    if (!students.length) return;
    const current = students.find((student) => student.id === previewStudentId);
    if (current) return;
    setPreviewStudentId(students[0].id);
    setPreviewStudentName(students[0].name);
  }, [students, previewStudentId]);

  const handlePreviewStudentChange = (studentId: string) => {
    const student = students.find((item) => item.id === studentId);
    setPreviewStudentId(studentId);
    setPreviewStudentName(student?.name ?? '');
  };

  const handleExportPreviewPdf = async () => {
    if (!selectedEvaluation || !template || isExportingPdf) return;

    const studentName = previewStudentName.trim();
    if (!studentName) {
      toast({
        title: 'Informe o nome',
        description: 'O certificado precisa do nome do aluno desta avaliação.',
        variant: 'destructive',
      });
      return;
    }

    setIsExportingPdf(true);
    try {
      const evaluationTitle = selectedEvaluationData?.title || 'Avaliação';
      await downloadCertificatePdf(
        buildPreviewCertificate({
          template,
          evaluationId: selectedEvaluation,
          evaluationTitle,
          studentName,
          studentId: previewStudent?.id,
          grade: previewStudent?.grade,
        }),
        certificatePdfFilename(studentName),
        {
          brandingCityId: municipalityId,
          hideGrade: previewStudent?.grade === undefined,
        }
      );
      toast({
        title: 'PDF exportado',
        description: `O certificado de ${studentName} foi baixado em PDF.`,
      });
    } catch (error) {
      console.error('Erro ao exportar certificado:', error);
      toast({
        title: 'Erro ao exportar',
        description: 'Não foi possível gerar o PDF do certificado.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleActivateArtwork = async (artworkId: string) => {
    if (!selectedEvaluation) return;
    try {
      const active = await CertificateArtworksApiService.activate(selectedEvaluation, artworkId);
      setArtworks((current) => current.map((item) => ({
        ...item,
        status: item.id === active.id ? 'active' : 'inactive',
      })));
      toast({ title: 'Modelo ativado', description: 'O modelo ficará disponível para a próxima etapa de composição.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível ativar o modelo.', variant: 'destructive' });
    }
  };

  const handleSelectEvaluation = (evaluationId: string, evaluationData?: EvaluationWithCertificates) => {
    setSelectedEvaluation(evaluationId);
    setSelectedEvaluationData(evaluationData || null);
    setIsCustomizing(false);
  };

  const handleBack = () => {
    setSelectedEvaluation(null);
    setSelectedEvaluationData(null);
    setIsCustomizing(false);
    setTemplate(null);
    setStudents([]);
  };

  const handleSaveTemplate = async (newTemplate: CertificateTemplate) => {
    if (!selectedEvaluation) return;

    try {
      const savedTemplate = await CertificatesApiService.saveCertificateTemplate({
        ...newTemplate,
        evaluation_id: selectedEvaluation
      });
      setTemplate(savedTemplate);
      setIsCustomizing(false);
      toast({
        title: 'Sucesso',
        description: 'Template salvo com sucesso!',
      });
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o template.',
        variant: 'destructive',
      });
    }
  };

  const handleApproveCertificates = async () => {
    if (!selectedEvaluation || !template || studentsAwaitingApproval.length === 0) return;

    setIsApproving(true);
    try {
      // Primeiro, garantir que o template está salvo no backend
      await CertificatesApiService.saveCertificateTemplate({
        ...template,
        evaluation_id: selectedEvaluation
      });

      // Aprovar certificados ainda não aprovados
      const studentIds = studentsAwaitingApproval.map((s) => s.id);
      if (studentIds.length === 0) return;

      const result = await CertificatesApiService.approveCertificates(
        selectedEvaluation,
        studentIds
      );

      // Mostrar mensagem com detalhes da resposta
      const message = result.message ||
        `Certificados processados: ${result.total_processed || studentIds.length} emitidos/atualizados`;
      
      toast({
        title: 'Sucesso',
        description: message,
      });

      // Se houver erros, mostrar aviso
      if (result.errors && result.errors.length > 0) {
        console.warn('Alguns certificados tiveram erros:', result.errors);
      }

      // Recarregar dados para atualizar status
      const updatedStudents = await CertificatesApiService.getApprovedStudents(selectedEvaluation);
      setStudents(updatedStudents);
      setStudentListRefreshKey((key) => key + 1);
    } catch (error: any) {
      console.error('Erro ao aprovar certificados:', error);
      const errorMessage = error?.message || 'Não foi possível aprovar os certificados.';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoadingHierarchy) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Para admin, não precisa de escola/município específico - pode ver todas
  // Para tecadm, basta ter município (não tem escola vinculada)
  const missingContext = user.role === 'tecadm'
    ? !municipalityId
    : !schoolId || !municipalityId;

  if (user.role !== 'admin' && missingContext) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Não foi possível identificar sua escola. Entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedEvaluation) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <Award className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
            Certificados
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {user.role === 'admin'
              ? 'Visualize todas as avaliações do sistema para gerenciar certificados'
              : 'Selecione uma avaliação para gerenciar certificados dos alunos participantes'}
          </p>
        </div>
        <CertificateList
          schoolId={schoolId || undefined}
          municipalityId={municipalityId || undefined}
          isAdmin={user.role === 'admin'}
          onSelectEvaluation={handleSelectEvaluation}
        />
      </div>
    );
  }

  if (isCustomizing) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setIsCustomizing(false)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <Award className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
              Personalizar Certificado
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Personalize o certificado que será enviado aos alunos
            </p>
          </div>
        </div>
        <CertificateCustomizer
          evaluationId={selectedEvaluation}
          initialTemplate={template || undefined}
          evaluationTitle={selectedEvaluationData?.title}
          students={students}
          onSave={handleSaveTemplate}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Button variant="ghost" onClick={handleBack} className="self-start sm:self-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <Award className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
              Gerenciar Certificados
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Personalize e aprove certificados para os alunos participantes
            </p>
            {students.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium">
                  {certificateStats.approved} de {certificateStats.total} certificado
                  {certificateStats.total !== 1 ? 's' : ''} aprovado
                  {certificateStats.approved !== 1 ? 's' : ''}
                </p>
                <CertificateStatsBadges stats={certificateStats} compact />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
          {template && (
            <Button
              variant="outline"
              onClick={() => void handleExportPreviewPdf()}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExportingPdf ? 'Exportando...' : 'Exportar PDF'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setIsCustomizing(true)}
          >
            Personalizar Certificado
          </Button>
          {canShowApproveButton && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      onClick={handleApproveCertificates}
                      disabled={isApproveDisabled}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {isApproving
                        ? 'Aprovando...'
                        : studentsAwaitingApproval.length === 0
                          ? 'Todos aprovados'
                          : `Aprovar ${studentsAwaitingApproval.length} Certificado(s)`}
                    </Button>
                  </span>
                </TooltipTrigger>
                {approveDisabledReason && (
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>{approveDisabledReason}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Modelo gráfico opcional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Envie um PDF ou imagem em A4 paisagem. O customizador atual continua disponível como fallback.</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            {isArtworkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar modelo
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              disabled={isArtworkUploading}
              onChange={(event) => {
                void handleArtworkUpload(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {isArtworkLoading ? <p className="text-sm text-muted-foreground">Carregando modelos...</p> : null}
          {artworks.map((artwork) => (
            <div key={artwork.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>{artwork.name} <span className="text-muted-foreground">({artwork.status})</span></span>
              {artwork.status !== 'active' && <Button size="sm" variant="outline" onClick={() => void handleActivateArtwork(artwork.id)}>Ativar</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Aviso quando o usuário não é o criador da avaliação */}
      {!isEvaluationCreator && selectedEvaluationData?.created_by && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Apenas o criador desta avaliação ({selectedEvaluationData.created_by.name || 'Usuário'}) pode aprovar os certificados.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <StudentList
            evaluationId={selectedEvaluation}
            evaluationTitle={selectedEvaluationData?.title ?? 'Avaliação'}
            brandingCityId={municipalityId}
            refreshKey={studentListRefreshKey}
            lockedSchoolId={
              ['diretor', 'coordenador', 'professor'].includes(user.role)
                ? schoolId
                : undefined
            }
          />
        </div>
        
        {template && (
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Preview do Certificado</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => void handleExportPreviewPdf()}
                disabled={isExportingPdf}
              >
                {isExportingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {isExportingPdf ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preview-student">Aluno da avaliação</Label>
                  <Select
                    value={previewStudentId || undefined}
                    onValueChange={handlePreviewStudentChange}
                    disabled={students.length === 0}
                  >
                    <SelectTrigger id="preview-student">
                      <SelectValue placeholder={students.length === 0 ? 'Nenhum aluno nesta avaliação' : 'Selecione o aluno'} />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preview-student-name">Nome no certificado</Label>
                  <Input
                    id="preview-student-name"
                    value={previewStudentName}
                    onChange={(event) => setPreviewStudentName(event.target.value)}
                    placeholder="Nome do aluno"
                  />
                </div>
              </div>
              <div 
                className="bg-gray-100 p-4 rounded-lg overflow-auto"
                style={{ maxHeight: '500px' }}
              >
                {/* Preview em formato paisagem */}
                <div 
                  style={{ 
                    width: '100%', 
                    maxWidth: '700px',
                    margin: '0 auto'
                  }}
                >
                  <CertificateTemplateComponent
                    template={template}
                    studentName={previewStudentName}
                    evaluationTitle={selectedEvaluationData?.title || 'Avaliação'}
                    grade={previewStudent?.grade}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CertificateRanking
        students={students}
        lockedSchoolId={
          ['diretor', 'coordenador', 'professor'].includes(user.role) ? schoolId : undefined
        }
      />
    </div>
  );
}

