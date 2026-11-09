import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { addCompetitionQuestions } from '@/services/competition/competitionsApi';
import { QuestionBank } from '@/components/evaluations/QuestionBank';
import { Loader2, BookOpen, ListOrdered } from 'lucide-react';

interface AddQuestionsModalProps {
  competitionId: string | null;
  competitionName: string;
  /** Disciplina da competição — usada para filtrar o banco de questões. */
  competitionSubjectId?: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddQuestionsModal({
  competitionId,
  competitionName,
  competitionSubjectId,
  open,
  onClose,
  onSuccess,
}: AddQuestionsModalProps) {
  const { toast } = useToast();
  const [rawIds, setRawIds] = useState('');
  const [loading, setLoading] = useState(false);

  const questionIds = rawIds
    .split(/[\n,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (!competitionId || questionIds.length === 0) {
      toast({
        title: 'Informe ao menos um identificador de questão.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      await addCompetitionQuestions(competitionId, questionIds);
      toast({
        title:
          questionIds.length === 1
            ? '1 questão adicionada com sucesso.'
            : `${questionIds.length} questões adicionadas com sucesso.`,
      });
      setRawIds('');
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ||
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Erro ao adicionar questões.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-7xl max-h-[90vh] w-[95vw] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 pb-2">
          <DialogTitle>Adicionar questões</DialogTitle>
          <DialogDescription>
            {competitionName}. Escolha no banco ou cole os identificadores das questões.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="bank" className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 sm:px-6 pb-4">
          <TabsList className="shrink-0 w-full grid grid-cols-2 max-w-xs">
            <TabsTrigger value="bank" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Banco de questões
            </TabsTrigger>
            <TabsTrigger value="ids" className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Colar identificadores
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bank" className="flex-1 min-h-0 overflow-hidden mt-3 data-[state=inactive]:hidden flex flex-col">
            <QuestionBank
              embedded
              subjectId={competitionSubjectId ?? null}
              onQuestionSelected={(q) => {
                setRawIds((prev) => (prev ? prev + '\n' + q.id : q.id));
              }}
            />
          </TabsContent>

          <TabsContent value="ids" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
            <div className="space-y-2">
              <Label htmlFor="question_ids">IDs das questões</Label>
              <Textarea
                id="question_ids"
                value={rawIds}
                onChange={(e) => setRawIds(e.target.value)}
                placeholder="Cole os identificadores separados por espaço"
                rows={12}
                className="font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {questionIds.length === 1
                  ? '1 questão encontrada.'
                  : `${questionIds.length} questões encontradas.`}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 px-4 py-3 sm:px-6 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || questionIds.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar {questionIds.length > 0 ? `(${questionIds.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
