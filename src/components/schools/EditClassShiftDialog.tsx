import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ClassShiftBadge } from "./ClassShiftBadge";
import { ClassShiftSelector } from "./ClassShiftSelector";
import {
  type ClassShiftCanonical,
  toApiShiftValue,
} from "@/lib/classShift";

interface EditClassShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  initialShift?: string | null;
  onSaved?: (shift: ClassShiftCanonical | null) => void;
}

export function EditClassShiftDialog({
  open,
  onOpenChange,
  classId,
  className,
  initialShift,
  onSaved,
}: EditClassShiftDialogProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ClassShiftCanonical | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(toApiShiftValue(initialShift));
    }
  }, [open, initialShift]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/classes/${classId}`, { shift: draft });
      toast({
        title: "Turno atualizado",
        description: draft
          ? `A turma ${className} está no turno ${draft}.`
          : `O turno da turma ${className} foi removido.`,
      });
      onSaved?.(draft);
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Não foi possível salvar o turno.";
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Editar turno
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Turma: <span className="font-medium text-foreground">{className}</span>
              </p>
              <p className="flex items-center gap-2 flex-wrap">
                Turno atual: <ClassShiftBadge shift={initialShift} />
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <ClassShiftSelector
          value={draft}
          onChange={setDraft}
          disabled={isSaving}
          showLabel={false}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar turno"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
