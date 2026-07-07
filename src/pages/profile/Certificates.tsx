import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/authContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeft, Award, CheckCircle2, Info } from 'lucide-react';
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
    const loadTemplateAndStudents = async () => {
      if (!selectedEvaluation) return;

      try {
        const [templateData, studentsData] = await Promise.all([
          CertificatesApiService.getCertificateTemplate(selectedEvaluation),
          CertificatesApiService.getApprovedStudents(selectedEvaluation)
        ]);

        setTemplate(templateData || null);
        setStudents(studentsData);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os dados da avaliação.',
          variant: 'destructive',
        });
      }
    };

    loadTemplateAndStudents();
  }, [selectedEvaluation, toast]);

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
            <CardHeader>
              <CardTitle>Preview do Certificado</CardTitle>
            </CardHeader>
            <CardContent>
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
                    studentName="Nome do Aluno"
                    evaluationTitle="Avaliação Exemplo"
                    grade={8.5}
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

