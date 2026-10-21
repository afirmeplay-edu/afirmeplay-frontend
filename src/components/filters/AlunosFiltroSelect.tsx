import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isResultadosAlunosFiltro,
  RESULTADOS_ALUNOS_OPCOES,
  type ResultadosAlunosFiltro,
} from "@/constants/resultadosAlunosFiltro";

type AlunosFiltroSelectProps = {
  value: string;
  onChange: (value: ResultadosAlunosFiltro) => void;
  disabled?: boolean;
  id?: string;
};

export function AlunosFiltroSelect({ value, onChange, disabled, id }: AlunosFiltroSelectProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        Alunos
      </label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (isResultadosAlunosFiltro(next)) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder="Selecione os alunos" />
        </SelectTrigger>
        <SelectContent>
          {RESULTADOS_ALUNOS_OPCOES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
