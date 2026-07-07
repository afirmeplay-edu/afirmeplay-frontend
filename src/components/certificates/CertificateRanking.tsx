import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Trophy } from 'lucide-react';
import {
  buildCertificateRanking,
  getRankingSchoolOptions,
  type CertificateRankingGroupBy,
} from '@/utils/certificateRanking';
import type { ApprovedStudent } from '@/types/certificates';

const ALL_SCHOOLS = 'all';

interface CertificateRankingProps {
  students: ApprovedStudent[];
  lockedSchoolId?: string | null;
}

const GROUP_LABELS: Record<CertificateRankingGroupBy, string> = {
  school: 'Escola',
  grade: 'Série',
  class: 'Turma',
};

export function CertificateRanking({ students, lockedSchoolId }: CertificateRankingProps) {
  const [groupBy, setGroupBy] = useState<CertificateRankingGroupBy>('school');
  const [schoolFilter, setSchoolFilter] = useState(ALL_SCHOOLS);

  const schoolOptions = useMemo(() => getRankingSchoolOptions(students), [students]);

  const effectiveSchoolId =
    lockedSchoolId ?? (schoolFilter !== ALL_SCHOOLS ? schoolFilter : null);

  const showSchoolFilter =
    !lockedSchoolId && schoolOptions.length > 1 && (groupBy === 'grade' || groupBy === 'class');

  useEffect(() => {
    setSchoolFilter(ALL_SCHOOLS);
  }, [groupBy]);

  const ranking = useMemo(
    () =>
      buildCertificateRanking(students, {
        groupBy,
        schoolId: groupBy === 'school' ? null : effectiveSchoolId,
      }),
    [students, groupBy, effectiveSchoolId]
  );

  if (students.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Ranking de certificados
          </CardTitle>
          <CardDescription>
            {GROUP_LABELS[groupBy]}s com mais certificados aprovados nesta avaliação
          </CardDescription>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Tabs
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as CertificateRankingGroupBy)}
          >
            <TabsList>
              <TabsTrigger value="school">Escola</TabsTrigger>
              <TabsTrigger value="grade">Série</TabsTrigger>
              <TabsTrigger value="class">Turma</TabsTrigger>
            </TabsList>
          </Tabs>

          {showSchoolFilter && (
            <div className="space-y-1.5 w-full sm:w-[260px]">
              <Label htmlFor="ranking-school-filter">Filtrar por escola</Label>
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger id="ranking-school-filter">
                  <SelectValue placeholder="Todas as escolas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SCHOOLS}>Todas as escolas</SelectItem>
                  {schoolOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum dado disponível para este recorte.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>{GROUP_LABELS[groupBy]}</TableHead>
                <TableHead className="text-center">Aprovados</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Elegíveis</TableHead>
                <TableHead className="min-w-[160px]">Taxa de aprovação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((entry, index) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-center font-medium">
                      {index < 3 ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          <Trophy
                            className={`h-4 w-4 ${
                              index === 0
                                ? 'text-amber-500'
                                : index === 1
                                  ? 'text-slate-400'
                                  : 'text-amber-700'
                            }`}
                          />
                          {index + 1}
                        </span>
                      ) : (
                        index + 1
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell className="text-center">{entry.approved}</TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      {entry.eligible}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={entry.approvalRate} className="h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums w-10">
                          {entry.approvalRate.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
