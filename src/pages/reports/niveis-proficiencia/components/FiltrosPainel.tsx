import { ClipboardList, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EvaluationInstrumentPicker,
  ResultsPeriodMonthYearPicker,
} from '@/components/filters';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { getClassShiftLabel } from '@/lib/classShift';
import { cn } from '@/lib/utils';
import { PROFICIENCY_LEVELS } from '../lib/proficiencyLevelTokens';

export type FilterEntity = { id: string; nome: string; shift?: string };

export type FonteTab = 'online' | 'cartao';

type FiltrosPainelProps = {
  fonte: FonteTab;
  onFonteChange: (fonte: FonteTab) => void;
  selectedPeriod: string;
  onPeriodChange: (v: string) => void;
  periodoYm?: string;
  loadingFilters: boolean;
  loadingReport: boolean;
  onRefresh: () => void;
  canLoad: boolean;

  estado: string;
  municipio: string;
  instrumento: string;
  escola: string;
  serie: string;
  turma: string;
  turno: string;
  nivel: string;
  disciplina: string;

  onEstadoChange: (v: string) => void;
  onMunicipioChange: (v: string) => void;
  onInstrumentoChange: (v: string) => void;
  onEscolaChange: (v: string) => void;
  onSerieChange: (v: string) => void;
  onTurmaChange: (v: string) => void;
  onTurnoChange: (v: string) => void;
  onNivelChange: (v: string) => void;
  onDisciplinaChange: (v: string) => void;

  estados: FilterEntity[];
  municipios: FilterEntity[];
  escolas: FilterEntity[];
  series: FilterEntity[];
  turmas: FilterEntity[];
  turnos: string[];
  disciplinas: FilterEntity[];
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

export function FiltrosPainel(props: FiltrosPainelProps) {
  const isOnline = props.fonte === 'online';

  return (
    <Card className="no-print mt-5 border-border/80">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => props.onFonteChange('online')}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition',
                isOnline
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-muted/50'
              )}
            >
              <MonitorSmartphone className="h-4 w-4" />
              Avaliação online
            </button>
            <button
              type="button"
              onClick={() => props.onFonteChange('cartao')}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition',
                !isOnline
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-muted/50'
              )}
            >
              <ClipboardList className="h-4 w-4" />
              Cartão-resposta
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={props.loadingReport || props.loadingFilters || !props.canLoad}
            onClick={props.onRefresh}
          >
            {props.loadingReport ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>

        <ResultsPeriodMonthYearPicker
          value={props.selectedPeriod}
          onChange={props.onPeriodChange}
          disabled={props.loadingFilters}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div>
            <FieldLabel>Estado</FieldLabel>
            <Select value={props.estado} onValueChange={props.onEstadoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {props.estados.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Município</FieldLabel>
            <Select
              value={props.municipio}
              onValueChange={props.onMunicipioChange}
              disabled={props.estado === 'all'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Município" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {props.municipios.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <EvaluationInstrumentPicker
            label={isOnline ? 'Avaliação' : 'Gabarito'}
            className="space-y-1 [&_label]:mb-1 [&_label]:block [&_label]:text-[11px] [&_label]:font-semibold [&_label]:uppercase [&_label]:tracking-wide [&_label]:text-muted-foreground"
            estado={props.estado}
            municipio={props.municipio}
            periodo={props.periodoYm}
            estadoLabel={props.estados.find((x) => x.id === props.estado)?.nome}
            municipioLabel={props.municipios.find((x) => x.id === props.municipio)?.nome}
            periodoLabel={props.periodoYm}
            value={props.instrumento}
            onChange={props.onInstrumentoChange}
            disabled={props.municipio === 'all'}
            loading={props.loadingFilters}
            allowAll
            allLabel="Todos"
            placeholder={isOnline ? 'Avaliação' : 'Gabarito'}
            reportEntityType={isOnline ? undefined : REPORT_ENTITY_TYPE_ANSWER_SHEET}
          />

          <div>
            <FieldLabel>Escola</FieldLabel>
            <Select
              value={props.escola}
              onValueChange={props.onEscolaChange}
              disabled={props.instrumento === 'all'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {props.escolas.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Série</FieldLabel>
            <Select
              value={props.serie}
              onValueChange={props.onSerieChange}
              disabled={props.instrumento === 'all'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Série" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {props.series.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Turma</FieldLabel>
            <Select
              value={props.turma}
              onValueChange={props.onTurmaChange}
              disabled={props.serie === 'all'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Turma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {props.turmas.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.shift
                      ? `${x.nome} (${getClassShiftLabel(x.shift)})`
                      : x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Turno</FieldLabel>
            <Select value={props.turno} onValueChange={props.onTurnoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {props.turnos.map((t) => (
                  <SelectItem key={t} value={t}>
                    {getClassShiftLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Nível de proficiência</FieldLabel>
            <Select value={props.nivel} onValueChange={props.onNivelChange}>
              <SelectTrigger>
                <SelectValue placeholder="Nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {PROFICIENCY_LEVELS.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Disciplina</FieldLabel>
            <Select value={props.disciplina} onValueChange={props.onDisciplinaChange}>
              <SelectTrigger>
                <SelectValue placeholder="Disciplina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {props.disciplinas.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
