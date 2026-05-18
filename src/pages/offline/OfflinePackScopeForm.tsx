import React from 'react';
import { GraduationCap, Hash, Info, School, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toggleInSet, type ClassRow, type SchoolRow, type StudentRow, type TestRow } from './offlinePackShared';
import type { useOfflinePackForm } from './useOfflinePackForm';

type FormSlice = Pick<
  ReturnType<typeof useOfflinePackForm>,
  | 'scopeMode'
  | 'setScopeMode'
  | 'schools'
  | 'grades'
  | 'visibleClasses'
  | 'tests'
  | 'students'
  | 'selectedSchoolIds'
  | 'setSelectedSchoolIds'
  | 'selectedGradeIds'
  | 'setSelectedGradeIds'
  | 'selectedClassIds'
  | 'setSelectedClassIds'
  | 'selectedTestIds'
  | 'setSelectedTestIds'
  | 'selectedStudentIds'
  | 'setSelectedStudentIds'
  | 'loadingSchools'
  | 'loadingClasses'
  | 'loadingTests'
  | 'loadingStudents'
  | 'singleClassIdForStudents'
  | 'customScopeValid'
>;

interface OfflinePackScopeFormProps {
  form: FormSlice;
  showValidation?: boolean;
}

export function OfflinePackScopeForm({ form, showValidation = true }: OfflinePackScopeFormProps) {
  const {
    scopeMode,
    setScopeMode,
    schools,
    grades,
    visibleClasses,
    tests,
    students,
    selectedSchoolIds,
    setSelectedSchoolIds,
    selectedGradeIds,
    setSelectedGradeIds,
    selectedClassIds,
    setSelectedClassIds,
    selectedTestIds,
    setSelectedTestIds,
    selectedStudentIds,
    setSelectedStudentIds,
    loadingSchools,
    loadingClasses,
    loadingTests,
    loadingStudents,
    singleClassIdForStudents,
    customScopeValid,
  } = form;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Escopo dos dados</CardTitle>
        <CardDescription>
          Escolha entre sincronizar todo o município ou apenas escolas, turmas, provas e alunos
          específicos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={scopeMode}
          onValueChange={(v) => setScopeMode(v as 'municipality' | 'custom')}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label
            className={cn(
              'flex cursor-pointer flex-col rounded-xl border p-4 transition-colors',
              scopeMode === 'municipality'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:bg-muted/40'
            )}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="municipality" id="scope-mun" className="mt-1" />
              <div>
                <span className="font-medium">Município inteiro</span>
                <p className="text-muted-foreground mt-1 text-sm leading-snug">
                  Inclui todas as escolas e dados do município atual.
                </p>
              </div>
            </div>
          </label>
          <label
            className={cn(
              'flex cursor-pointer flex-col rounded-xl border p-4 transition-colors',
              scopeMode === 'custom'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:bg-muted/40'
            )}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="custom" id="scope-custom" className="mt-1" />
              <div>
                <span className="font-medium">Personalizado</span>
                <p className="text-muted-foreground mt-1 text-sm leading-snug">
                  Limite a escolas, séries (via turmas), turmas, provas ou alunos.
                </p>
              </div>
            </div>
          </label>
        </RadioGroup>

        {scopeMode === 'custom' && (
          <CustomScopeFields
            schools={schools}
            grades={grades}
            visibleClasses={visibleClasses}
            tests={tests}
            students={students}
            selectedSchoolIds={selectedSchoolIds}
            setSelectedSchoolIds={setSelectedSchoolIds}
            selectedGradeIds={selectedGradeIds}
            setSelectedGradeIds={setSelectedGradeIds}
            selectedClassIds={selectedClassIds}
            setSelectedClassIds={setSelectedClassIds}
            selectedTestIds={selectedTestIds}
            setSelectedTestIds={setSelectedTestIds}
            selectedStudentIds={selectedStudentIds}
            setSelectedStudentIds={setSelectedStudentIds}
            loadingSchools={loadingSchools}
            loadingClasses={loadingClasses}
            loadingTests={loadingTests}
            loadingStudents={loadingStudents}
            singleClassIdForStudents={singleClassIdForStudents}
            showValidation={showValidation}
            customScopeValid={customScopeValid}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CustomScopeFields(props: {
  schools: SchoolRow[];
  grades: Array<{ id: string; name: string }>;
  visibleClasses: ClassRow[];
  tests: TestRow[];
  students: StudentRow[];
  selectedSchoolIds: Set<string>;
  setSelectedSchoolIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedGradeIds: Set<string>;
  setSelectedGradeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedClassIds: Set<string>;
  setSelectedClassIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedTestIds: Set<string>;
  setSelectedTestIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedStudentIds: Set<string>;
  setSelectedStudentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  loadingSchools: boolean;
  loadingClasses: boolean;
  loadingTests: boolean;
  loadingStudents: boolean;
  singleClassIdForStudents: string | null;
  showValidation: boolean;
  customScopeValid: boolean;
}) {
  const {
    schools,
    grades,
    visibleClasses,
    tests,
    students,
    selectedSchoolIds,
    setSelectedSchoolIds,
    selectedGradeIds,
    setSelectedGradeIds,
    selectedClassIds,
    setSelectedClassIds,
    selectedTestIds,
    setSelectedTestIds,
    selectedStudentIds,
    setSelectedStudentIds,
    loadingSchools,
    loadingClasses,
    loadingTests,
    loadingStudents,
    singleClassIdForStudents,
    showValidation,
    customScopeValid,
  } = props;

  return (
    <div className="space-y-6 border-t pt-6">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Ao salvar, o escopo é substituído por completo — envie todos os filtros desejados.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <School className="h-4 w-4" />
          Escolas
        </div>
        <ScrollArea className="h-[160px] rounded-lg border">
          <div className="space-y-0 p-3">
            {loadingSchools ? (
              <p className="text-muted-foreground text-sm">Carregando escolas…</p>
            ) : schools.length === 0 ? (
              <p className="text-muted-foreground text-sm">Selecione um município.</p>
            ) : (
              schools.map((sch) => (
                <label
                  key={sch.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 hover:bg-muted/60"
                >
                            <Checkbox
                              checked={selectedSchoolIds.has(String(sch.id))}
                              onCheckedChange={(c) =>
                                setSelectedSchoolIds((prev) =>
                                  toggleInSet(prev, String(sch.id), c === true)
                                )
                              }
                            />
                  <span className="text-sm">{sch.name}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedSchoolIds(new Set(schools.map((s) => s.id)))}
            disabled={schools.length === 0}
          >
            Marcar todas
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSchoolIds(new Set())}>
            Limpar escolas
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <GraduationCap className="h-4 w-4" />
          Séries (filtra turmas)
        </div>
        <ScrollArea className="h-[120px] rounded-lg border">
          <div className="space-y-0 p-3">
            {grades.map((g) => (
              <label
                key={g.id}
                className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 hover:bg-muted/60"
              >
                <Checkbox
                  checked={selectedGradeIds.has(g.id)}
                  onCheckedChange={(c) =>
                    setSelectedGradeIds((prev) => toggleInSet(prev, g.id, c === true))
                  }
                />
                <span className="text-sm">{g.name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </section>

      <section className="space-y-3">
        <div className="font-medium">Turmas</div>
        <ScrollArea className="h-[200px] rounded-lg border">
          <div className="space-y-0 p-3">
            {loadingClasses ? (
              <p className="text-muted-foreground text-sm">Carregando turmas…</p>
            ) : visibleClasses.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma turma encontrada.</p>
            ) : (
              visibleClasses.map((cl) => (
                <label
                  key={cl.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                              checked={selectedClassIds.has(String(cl.id))}
                              onCheckedChange={(c) =>
                                setSelectedClassIds((prev) =>
                                  toggleInSet(prev, String(cl.id), c === true)
                                )
                              }
                  />
                  <span className="text-sm">
                    {cl.name}
                    {cl.school?.name ? (
                      <span className="text-muted-foreground"> · {cl.school.name}</span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedClassIds(new Set(visibleClasses.map((c) => c.id)))}
            disabled={visibleClasses.length === 0}
          >
            Marcar turmas visíveis
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedClassIds(new Set())}>
            Limpar turmas
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Hash className="h-4 w-4" />
          Provas / avaliações
        </div>
        <ScrollArea className="h-[180px] rounded-lg border">
          <div className="space-y-0 p-3">
            {loadingTests ? (
              <p className="text-muted-foreground text-sm">Carregando provas…</p>
            ) : tests.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma prova listada.</p>
            ) : (
              tests.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selectedTestIds.has(String(t.id))}
                    onCheckedChange={(c) =>
                      setSelectedTestIds((prev) => toggleInSet(prev, String(t.id), c === true))
                    }
                  />
                  <span className="text-sm leading-snug">{t.titulo}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Users className="h-4 w-4" />
          Alunos (opcional)
        </div>
        {!singleClassIdForStudents ? (
          <p className="text-muted-foreground text-sm">
            Selecione <strong>exatamente uma turma</strong> para listar alunos.
          </p>
        ) : loadingStudents ? (
          <p className="text-muted-foreground text-sm">Carregando alunos…</p>
        ) : (
          <ScrollArea className="h-[160px] rounded-lg border">
            <div className="space-y-0 p-3">
              {students.map((st) => (
                <label
                  key={st.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selectedStudentIds.has(st.id)}
                    onCheckedChange={(c) =>
                      setSelectedStudentIds((prev) => toggleInSet(prev, st.id, c === true))
                    }
                  />
                  <span className="text-sm">{st.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
      </section>

      {showValidation && !customScopeValid && (
        <p className="text-destructive text-sm">
          Marque ao menos uma escola, turma, prova ou aluno para o escopo personalizado.
        </p>
      )}
    </div>
  );
}
