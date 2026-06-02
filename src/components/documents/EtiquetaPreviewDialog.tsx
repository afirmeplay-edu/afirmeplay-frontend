import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EtiquetaPreviewCanvas } from "@/components/documents/EtiquetaPreviewCanvas";
import type { EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";

type EtiquetaPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: EtiquetaEditItem | null;
  context: EtiquetasDadosResponse | null;
  logoUrl: string | null;
  labelIndex?: number;
};

export function EtiquetaPreviewDialog({
  open,
  onOpenChange,
  label,
  context,
  logoUrl,
  labelIndex,
}: EtiquetaPreviewDialogProps) {
  const titleSuffix = labelIndex != null ? ` — Etiqueta ${labelIndex + 1}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-4xl" ariaTitle={`Visualizar etiqueta${titleSuffix}`}>
        <DialogHeader>
          <DialogTitle>Visualizar etiqueta{titleSuffix}</DialogTitle>
        </DialogHeader>
        {label && context ? (
          <div className="mx-auto w-full max-w-[720px] px-1">
            <EtiquetaPreviewCanvas label={label} context={context} logoUrl={logoUrl} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
