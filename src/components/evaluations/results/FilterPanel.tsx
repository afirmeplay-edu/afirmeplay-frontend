import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { ResultsFilters, ProficiencyLevel, proficiencyLabels } from "@/types/evaluation-results";
import { PROFICIENCY_MAX_VALUES, CLASSIFICATION_LABELS } from "./constants";

interface FilterPanelProps {
  filters: ResultsFilters;
  onFiltersChange: (filters: ResultsFilters) => void;
  availableCourses: string[];
  availableSubjects: string[];
  availableClasses: string[];
  availableSchools?: string[];
}

export function FilterPanel({ 
  filters, 
  onFiltersChange, 
  availableCourses, 
  availableSubjects, 
  availableClasses,
  availableSchools = []
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getMaxProficiencyScale = () => {
    const selectedCourse = filters.course;
    const selectedSubject = filters.subject;
    
    const isMathematics = selectedSubject?.toLowerCase().includes('matemática') || 
                         selectedSubject?.toLowerCase().includes('matematica');
    
    if (selectedCourse === 'Anos Iniciais') {
      return isMathematics ? PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA : PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_OUTRAS;
    } else if (selectedCourse === 'Anos Finais' || selectedCourse === 'Ensino Médio') {
      return isMathematics ? PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA : PROFICIENCY_MAX_VALUES.ANOS_FINAIS_OUTRAS;
    }
    
    return PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA;
  };

  const maxProficiencyScale = getMaxProficiencyScale();
  
  const getProficiencyScaleDescription = () => {
    const selectedCourse = filters.course;
    const selectedSubject = filters.subject;
    
    if (!selectedCourse && !selectedSubject) {
      return "Escala dinâmica (350-425 conforme seleção)";
    }
    
    const isMathematics = selectedSubject?.toLowerCase().includes('matemática') || 
                         selectedSubject?.toLowerCase().includes('matematica');
    
    if (selectedCourse === 'Anos Iniciais') {
      return isMathematics 
        ? "P.M = 375 (Matemática - Anos Iniciais)"
        : "P.M = 350 (Geral - Anos Iniciais)";
    } else if (selectedCourse === 'Anos Finais' || selectedCourse === 'Ensino Médio') {
      return isMathematics 
        ? "P.M = 425 (Matemática - Anos Finais/EM)"
        : "P.M = 400 (Geral - Anos Finais/EM)";
    }
    
    return `P.M = ${maxProficiencyScale} (baseado na seleção atual)`;
  };

  const updateFilter = (key: keyof ResultsFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilter = (key: keyof ResultsFilters) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.course) count++;
    if (filters.subject) count++;
    if (filters.class) count++;
    if (filters.school) count++;
    if (filters.proficiencyRange) count++;
    if (filters.scoreRange) count++;
    if (filters.proficiencyLevels && filters.proficiencyLevels.length > 0) count++;
    if (filters.status && filters.status.length > 0) count++;
    if (filters.dateRange) count++;
    return count;
  };

  return (
    <>
      {/* Filtros ativos (badges) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.course && (
            <Badge variant="secondary" className="gap-1">
              Curso: {filters.course}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('course')}
              />
            </Badge>
          )}
          {filters.subject && (
            <Badge variant="secondary" className="gap-1">
              Disciplina: {filters.subject}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('subject')}
              />
            </Badge>
          )}
          {filters.class && (
            <Badge variant="secondary" className="gap-1">
              Turma: {filters.class}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('class')}
              />
            </Badge>
          )}
          {filters.school && (
            <Badge variant="secondary" className="gap-1">
              Escola: {filters.school}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('school')}
              />
            </Badge>
          )}
          {filters.status && filters.status.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              Status: {filters.status.join(', ')}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('status')}
              />
            </Badge>
          )}
          {filters.proficiencyLevels && filters.proficiencyLevels.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              Classificação: {filters.proficiencyLevels.length} selecionadas
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => clearFilter('proficiencyLevels')}
              />
            </Badge>
          )}
          {(filters.proficiencyRange || filters.scoreRange) && (
            <Badge variant="secondary" className="gap-1">
              Faixas aplicadas
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  clearFilter('proficiencyRange');
                  clearFilter('scoreRange');
                }}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Botão do painel de filtros */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hasActiveFilters && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                {getActiveFiltersCount()}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros Avançados</SheetTitle>
            <SheetDescription>
              Refine os resultados aplicando filtros específicos
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* Filtros Básicos */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Filtros Básicos</h3>
              
              {/* Curso */}
              <div className="space-y-2">
                <Label>Curso</Label>
                <Select 
                  value={filters.course || ""} 
                  onValueChange={(value) => updateFilter('course', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um curso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os cursos</SelectItem>
                    {availableCourses.map(course => (
                      <SelectItem key={course} value={course}>{course}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Disciplina */}
              <div className="space-y-2">
                <Label>Disciplina</Label>
                <Select 
                  value={filters.subject || ""} 
                  onValueChange={(value) => updateFilter('subject', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as disciplinas</SelectItem>
                    {availableSubjects.map(subject => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de área</Label>
                <Select
                  value={filters.areaType || ""}
                  onValueChange={(value) => updateFilter('areaType', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    <SelectItem value="urbana">Zona urbana</SelectItem>
                    <SelectItem value="rural">Zona rural</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Escola */}
              <div className="space-y-2">
                <Label>Escola</Label>
                <Select 
                  value={filters.school || ""} 
                  onValueChange={(value) => updateFilter('school', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma escola" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as escolas</SelectItem>
                    {availableSchools.map(school => (
                      <SelectItem key={school} value={school}>{school}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Turma */}
              <div className="space-y-2">
                <Label>Turma</Label>
                <Select 
                  value={filters.class || ""} 
                  onValueChange={(value) => updateFilter('class', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma turma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as turmas</SelectItem>
                    {availableClasses.map(cls => (
                      <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Filtros de Performance */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Filtros de Performance</h3>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Faixa de Proficiência (0-{maxProficiencyScale})</Label>
                  <p className="text-xs text-muted-foreground">
                    {getProficiencyScaleDescription()}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mínimo</Label>
                    <Input
                      type="number"
                      min="0"
                      max={maxProficiencyScale}
                      placeholder="0"
                      value={filters.proficiencyRange?.[0] || ""}
                      onChange={(e) => {
                        const min = parseInt(e.target.value) || 0;
                        const max = filters.proficiencyRange?.[1] || maxProficiencyScale;
                        updateFilter('proficiencyRange', [min, max]);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máximo</Label>
                    <Input
                      type="number"
                      min="0"
                      max={maxProficiencyScale}
                      placeholder={maxProficiencyScale.toString()}
                      value={filters.proficiencyRange?.[1] || ""}
                      onChange={(e) => {
                        const max = parseInt(e.target.value) || maxProficiencyScale;
                        const min = filters.proficiencyRange?.[0] || 0;
                        updateFilter('proficiencyRange', [min, max]);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Faixa de Nota */}
              <div className="space-y-3">
                <Label>Faixa de Nota (0-10)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mínimo</Label>
                    <Input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      placeholder="0"
                      value={filters.scoreRange?.[0] || ""}
                      onChange={(e) => {
                        const min = parseFloat(e.target.value) || 0;
                        const max = filters.scoreRange?.[1] || 10;
                        updateFilter('scoreRange', [min, max]);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máximo</Label>
                    <Input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      placeholder="10"
                      value={filters.scoreRange?.[1] || ""}
                      onChange={(e) => {
                        const max = parseFloat(e.target.value) || 10;
                        const min = filters.scoreRange?.[0] || 0;
                        updateFilter('scoreRange', [min, max]);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Filtros de Classificação */}
            <div className="space-y-3">
              <Label>Classificação</Label>
              <div className="space-y-2">
                {Object.entries(proficiencyLabels).map(([level, label]) => (
                  <div key={level} className="flex items-center space-x-2">
                    <Checkbox
                      id={level}
                      checked={filters.proficiencyLevels?.includes(level as ProficiencyLevel) || false}
                      onCheckedChange={(checked) => {
                        const currentLevels = filters.proficiencyLevels || [];
                        if (checked) {
                          updateFilter('proficiencyLevels', [...currentLevels, level as ProficiencyLevel]);
                        } else {
                          updateFilter('proficiencyLevels', currentLevels.filter(l => l !== level));
                        }
                      }}
                    />
                    <Label htmlFor={level} className="text-sm">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="space-y-3">
              <Label>Status</Label>
              <div className="space-y-2">
                {[
                  { value: 'completed', label: 'Concluída' },
                  { value: 'pending', label: 'Pendente' },
                  { value: 'in_progress', label: 'Em Andamento' }
                ].map(({ value, label }) => (
                  <div key={value} className="flex items-center space-x-2">
                    <Checkbox
                      id={value}
                      checked={filters.status?.includes(value as any) || false}
                      onCheckedChange={(checked) => {
                        const currentStatus = filters.status || [];
                        if (checked) {
                          updateFilter('status', [...currentStatus, value as any]);
                        } else {
                          updateFilter('status', currentStatus.filter(s => s !== value));
                        }
                      }}
                    />
                    <Label htmlFor={value} className="text-sm">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Botões de ação */}
            <div className="flex flex-col gap-2">
              <Button onClick={() => setIsOpen(false)}>
                Aplicar Filtros
              </Button>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearAllFilters}>
                  Limpar Todos os Filtros
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
} 