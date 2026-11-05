import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Award, GraduationCap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CertificateList } from '@/components/certificates/CertificateList';
import { FormationGenerateForm } from '@/components/certificates/formation/FormationGenerateForm';
import { useAuth } from '@/context/authContext';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import type { EvaluationWithCertificates } from '@/types/certificates';

type Modality = 'performance' | 'formation';

export default function CertificateGeneratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modalityParam = searchParams.get('modality');
  const modality: Modality | null =
    modalityParam === 'performance' || modalityParam === 'formation' ? modalityParam : null;

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [municipalityId, setMunicipalityId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user.id) return;
      try {
        const hierarchy = await getUserHierarchyContext(user.id, user.role);
        if (cancelled) return;
        setSchoolId(hierarchy.school?.id || null);
        setMunicipalityId(hierarchy.municipality?.id || null);
      } catch {
        if (!cancelled) {
          setSchoolId(null);
          setMunicipalityId(null);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.role]);

  const setModality = (next: Modality) => {
    setSearchParams({ modality: next });
  };

  const title = useMemo(() => {
    if (modality === 'performance') return 'Gerar certificado de desempenho';
    if (modality === 'formation') return 'Gerar certificado de formação';
    return 'Gerar certificado';
  }, [modality]);

  const handleSelectEvaluation = (
    evaluationId: string,
    _evaluationData?: EvaluationWithCertificates
  ) => {
    navigate(`/app/certificados?evaluationId=${evaluationId}`);
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Award className="h-7 w-7 shrink-0 text-blue-600 sm:h-8 sm:w-8" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Escolha a modalidade e preencha os dados para emitir certificados dinamicamente.
          </p>
        </div>
        <Button variant="ghost" asChild className="self-end sm:self-start">
          <Link to="/app/certificados">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      {!modality ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className="cursor-pointer transition hover:border-blue-500 hover:shadow-md"
            onClick={() => setModality('performance')}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-blue-600" />
                Desempenho (avaliação)
              </CardTitle>
              <CardDescription>
                Certificados dos alunos elegíveis por avaliação/olimpíada, no fluxo já existente de
                template e aprovação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button>Continuar</Button>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition hover:border-blue-500 hover:shadow-md"
            onClick={() => setModality('formation')}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Formação (formadores / professores)
              </CardTitle>
              <CardDescription>
                Modelo institucional com frente/verso, temáticas, carga horária, participantes
                manuais/CSV ou usuários do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button>Continuar</Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {modality === 'performance' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Selecione uma avaliação para abrir o gerenciamento/emissão de certificados de
              desempenho.
            </p>
            <Button variant="outline" onClick={() => setSearchParams({})}>
              Trocar modalidade
            </Button>
          </div>
          <CertificateList
            schoolId={schoolId || undefined}
            municipalityId={municipalityId || undefined}
            isAdmin={user.role === 'admin'}
            onSelectEvaluation={handleSelectEvaluation}
          />
        </div>
      ) : null}

      {modality === 'formation' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSearchParams({})}>
              Trocar modalidade
            </Button>
          </div>
          <FormationGenerateForm />
        </div>
      ) : null}
    </div>
  );
}
