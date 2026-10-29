import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RelatorioSectionTitle,
  RelatorioSubsectionTitle,
} from '@/components/reports/relatorio-geral/RelatorioSectionTitle';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_PROFESSORES,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import {
  rotuloTurma,
  rotulosSeries,
  type ProfessorResponsavel,
} from '@/utils/reports/professoresResponsaveis';

type ProfessoresResponsaveisSectionProps = {
  professores: ProfessorResponsavel[];
  loading: boolean;
  erro: string | null;
  aviso: string | null;
  onRetry?: () => void;
};

function textoBusca(professor: ProfessorResponsavel): string {
  return [
    professor.nome,
    professor.email,
    professor.escola_nome,
    ...rotulosSeries(professor),
    ...professor.turmas.map(rotuloTurma),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

export function ProfessoresResponsaveisSection({
  professores,
  loading,
  erro,
  aviso,
  onRetry,
}: ProfessoresResponsaveisSectionProps) {
  const [busca, setBusca] = useState('');
  const variasEscolas = useMemo(
    () => new Set(professores.map((professor) => professor.escola_id)).size > 1,
    [professores]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return professores;
    return professores.filter((professor) => textoBusca(professor).includes(termo));
  }, [busca, professores]);

  const totalTurmas = useMemo(() => {
    const ids = new Set<string>();
    for (const professor of professores) {
      for (const turma of professor.turmas) {
        ids.add(`${professor.escola_id}:${turma.turma_id}`);
      }
    }
    return ids.size;
  }, [professores]);

  return (
    <section className="space-y-4">
      <RelatorioSectionTitle title={relatorioSecaoTitle(8, RELATORIO_SECAO_PROFESSORES)} />
      <RelatorioSubsectionTitle label="8.1. Séries e turmas" />
      <p className="text-sm text-muted-foreground leading-relaxed">
        Professores responsáveis pelas séries e turmas do recorte deste relatório, conforme o vínculo cadastrado na escola.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando séries e turmas dos professores…
        </div>
      ) : null}

      {!loading && erro ? (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {erro}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}

      {!loading && !erro && aviso && professores.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">{aviso}</p>
      ) : null}

      {!loading && !erro && professores.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {professores.length} {professores.length === 1 ? 'professor' : 'professores'}
              {' · '}
              {totalTurmas} {totalTurmas === 1 ? 'turma' : 'turmas'}
            </p>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar professor, série ou turma"
                aria-label="Buscar professor, série ou turma"
                className="pl-9 h-10"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  {variasEscolas ? (
                    <TableHead className="text-primary-foreground font-bold">Escola</TableHead>
                  ) : null}
                  <TableHead className="text-primary-foreground font-bold">Professor</TableHead>
                  <TableHead className="text-primary-foreground font-bold">Séries</TableHead>
                  <TableHead className="text-primary-foreground font-bold">Turmas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={variasEscolas ? 4 : 3}
                      className="text-sm text-muted-foreground text-center py-6"
                    >
                      Nenhum professor encontrado para essa busca.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((professor) => {
                    const series = rotulosSeries(professor);
                    return (
                      <TableRow key={`${professor.escola_id}-${professor.teacher_id}-${professor.email ?? ''}`}>
                        {variasEscolas ? (
                          <TableCell className="align-top font-medium whitespace-nowrap">
                            {professor.escola_nome}
                          </TableCell>
                        ) : null}
                        <TableCell className="align-top min-w-[160px]">
                          <div className="font-medium">{professor.nome}</div>
                          {professor.email ? (
                            <div className="text-xs text-muted-foreground break-all">{professor.email}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top min-w-[140px]">
                          <div className="flex flex-wrap gap-1">
                            {series.length > 0 ? (
                              series.map((serie) => (
                                <Badge key={serie} variant="secondary">
                                  {serie}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">Série não informada</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top min-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {professor.turmas.map((turma) => (
                              <Badge key={turma.turma_id || rotuloTurma(turma)} variant="outline">
                                {rotuloTurma(turma)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
