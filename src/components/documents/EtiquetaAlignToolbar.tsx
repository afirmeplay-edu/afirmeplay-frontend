import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EtiquetaTextoLivreAlinhamento } from "@/types/etiquetas";

type EtiquetaAlignToolbarProps = {
  value: EtiquetaTextoLivreAlinhamento;
  onChange: (value: EtiquetaTextoLivreAlinhamento) => void;
  id?: string;
};

export function EtiquetaAlignToolbar({ value, onChange, id }: EtiquetaAlignToolbarProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Alinhamento do texto livre</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next === "left" || next === "center" || next === "right") {
            onChange(next);
          }
        }}
        className="justify-start"
        id={id}
      >
        <ToggleGroupItem value="left" aria-label="Alinhar à esquerda" title="Esquerda" className="px-2.5">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Centralizar" title="Centro" className="px-2.5">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Alinhar à direita" title="Direita" className="px-2.5">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
