import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen, Building, Clock, GraduationCap, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CLASS_SHIFT_OPTIONS,
  getClassShiftLabel,
  normalizeClassShift,
} from "@/lib/classShift";

export interface TurmasSeriesReportSchool {
  id: string;
  name: string;
}

export interface TurmasSeriesReportTurma {
  id: string;
  name: string;
  school_id: string;
  grade_id?: string;
  shift?: string | null;
  students_count?: number;
  school?: { id: string; name: string };
  grade?: {
    id: string;
    name: string;
    education_stage_id?: string;
    education_stage?: { id: string; name: string };
  };
}

interface TurmasSeriesReportProps {
  turmas: TurmasSeriesReportTurma[];
  schools: TurmasSeriesReportSchool[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#33658A",
  "#758E4F",
  "#F6AE2D",
  "#F26419",
  "#6D597A",
  "#B56576",
  "#55A6A6",
];

const ALL = "all";

/**
 * Relatório consolidado de turmas por série.
 * Dados: `/school` + `/classes/school/:id` (já carregados na página de Turmas).
 *
 * O pedido original citava filtro por "disciplina". Turmas não expõem `subject_id`
 * nas rotas usadas aqui; o terceiro filtro usa o curso/etapa (`grade.education_stage`),
 * que é o atributo categórico disponível no payload da turma.
 */
export function TurmasSeriesReport({ turmas, schools }: TurmasSeriesReportProps) {
  const [filterSchoolId, setFilterSchoolId] = useState(ALL);
  const [filterShift, setFilterShift] = useState(ALL);
  const [filterCourseId, setFilterCourseId] = useState(ALL);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const turma of turmas) {
      const stage = turma.grade?.education_stage;
      const id = stage?.id || turma.grade?.education_stage_id;
      const name = stage?.name?.trim();
      if (id && name) map.set(String(id), name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [turmas]);

  const filteredTurmas = useMemo(() => {
    return turmas.filter((turma) => {
      if (filterSchoolId !== ALL && turma.school_id !== filterSchoolId) return false;

      if (filterShift !== ALL) {
        const shift = normalizeClassShift(turma.shift);
        if (filterShift === "__none__") {
          if (shift) return false;
        } else if (shift !== filterShift) {
          return false;
        }
      }

      if (filterCourseId !== ALL) {
        const courseId =
          turma.grade?.education_stage?.id || turma.grade?.education_stage_id;
        if (String(courseId || "") !== filterCourseId) return false;
      }

      return true;
    });
  }, [turmas, filterSchoolId, filterShift, filterCourseId]);

  const totalTurmas = filteredTurmas.length;
  const totalAlunos = filteredTurmas.reduce(
    (acc, t) => acc + (Number(t.students_count) || 0),
    0
  );
  const escolasComTurma = useMemo(() => {
    const ids = new Set(filteredTurmas.map((t) => t.school_id).filter(Boolean));
    return ids.size;
  }, [filteredTurmas]);

  const bySerie = useMemo(() => {
    const map = new Map<string, { name: string; turmas: number; alunos: number }>();
    for (const turma of filteredTurmas) {
      const key = turma.grade?.id || turma.grade_id || "__sem_serie__";
      const name = turma.grade?.name?.trim() || "Sem série";
      const prev = map.get(key) || { name, turmas: 0, alunos: 0 };
      prev.turmas += 1;
      prev.alunos += Number(turma.students_count) || 0;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { numeric: true })
    );
  }, [filteredTurmas]);

  const byTurno = useMemo(() => {
    const map = new Map<string, number>();
    for (const turma of filteredTurmas) {
      const label = getClassShiftLabel(turma.shift);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTurmas]);

  const chartSerieData = bySerie.map((row) => ({
    name: row.name,
    turmas: row.turmas,
    alunos: row.alunos,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          Relatório de Turmas e Séries
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visão consolidada de quantas turmas existem por série, com filtros por escola, turno e
          curso (etapa).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="report-filter-school">Escola</Label>
          <Select value={filterSchoolId} onValueChange={setFilterSchoolId}>
            <SelectTrigger id="report-filter-school">
              <SelectValue placeholder="Todas as escolas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as escolas</SelectItem>
              {schools.map((school) => (
                <SelectItem key={school.id} value={school.id}>
                  {school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-filter-shift">Turno</Label>
          <Select value={filterShift} onValueChange={setFilterShift}>
            <SelectTrigger id="report-filter-shift">
              <SelectValue placeholder="Todos os turnos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os turnos</SelectItem>
              {CLASS_SHIFT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
              <SelectItem value="__none__">Sem turno</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-filter-course">Curso</Label>
          <Select value={filterCourseId} onValueChange={setFilterCourseId}>
            <SelectTrigger id="report-filter-course">
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os cursos</SelectItem>
              {courseOptions.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de turmas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTurmas}</div>
            <p className="text-xs text-muted-foreground">Após filtros aplicados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Séries distintas</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bySerie.length}</div>
            <p className="text-xs text-muted-foreground">Com ao menos uma turma</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escolas</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{escolasComTurma}</div>
            <p className="text-xs text-muted-foreground">Com turmas no filtro</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alunos</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlunos}</div>
            <p className="text-xs text-muted-foreground">Soma dos contadores das turmas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turmas por série</CardTitle>
            <CardDescription>Quantidade de turmas agrupadas por série</CardDescription>
          </CardHeader>
          <CardContent>
            {chartSerieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                Nenhuma turma encontrada com os filtros atuais.
              </p>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartSerieData}
                    margin={{ top: 16, right: 8, left: 0, bottom: 48 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-28}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [value, "Turmas"]}
                      labelFormatter={(label) => `Série: ${label}`}
                    />
                    <Bar dataKey="turmas" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Distribuição por turno
            </CardTitle>
            <CardDescription>Proporção de turmas em cada turno</CardDescription>
          </CardHeader>
          <CardContent>
            {byTurno.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                Nenhuma turma encontrada com os filtros atuais.
              </p>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byTurno}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                    >
                      {byTurno.map((_, index) => (
                        <Cell
                          key={`turno-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, "Turmas"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento por série</CardTitle>
          <CardDescription>Turmas e alunos por série no escopo filtrado</CardDescription>
        </CardHeader>
        <CardContent>
          {bySerie.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum dado para exibir.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Série</TableHead>
                  <TableHead className="text-right">Turmas</TableHead>
                  <TableHead className="text-right">Alunos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySerie.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.turmas}</TableCell>
                    <TableCell className="text-right">{row.alunos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
