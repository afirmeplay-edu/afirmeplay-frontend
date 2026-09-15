import { CreateEvaluationModal } from "@/components/evaluations/create/CreateEvaluationModal";

interface CreateEvaluationTabContentProps {
  onDone: () => void;
}

/**
 * Conteúdo da aba "Criar Nova" na Central de Avaliações.
 * Reutiliza o formulário existente em modo embedded (sem Dialog externo).
 */
export function CreateEvaluationTabContent({
  onDone,
}: CreateEvaluationTabContentProps) {
  return (
    <CreateEvaluationModal
      isOpen
      embedded
      onClose={onDone}
      onSuccess={onDone}
    />
  );
}
