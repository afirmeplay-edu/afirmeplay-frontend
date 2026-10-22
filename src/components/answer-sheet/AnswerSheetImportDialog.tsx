import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet, Loader2, Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

export type AnswerSheetLetter = 'A' | 'B' | 'C' | 'D';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
const MIN_ALTERNATIVES = 2;
/** O cartão impresso ainda não suporta a 5ª alternativa (E). */
const MAX_SUPPORTED_ALTERNATIVES = 4;
const DEFAULT_ALTERNATIVES = 4;
const UNSUPPORTED_ALTERNATIVE_NOTICE = 'A 5ª alternativa (E) ainda não é suportada no cartão impresso.';
const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type PreviewRow = {
  line: number;
  question: number | null;
  answer: string | null;
  alternatives_count: number | null;
  subject: { id: string; name: string } | null;
  subject_input: string;
  skill: { id: string; code: string; description: string } | null;
  skill_input: string;
  errors: string[];
  warnings: string[];
};

export type AnswerSheetImportBlock = {
  subject_id: string;
  subject_name: string;
  start_question: number;
  end_question: number;
  questions_count: number;
};

type PreviewResponse = {
  rows: PreviewRow[];
  blocks: AnswerSheetImportBlock[];
  metadata: { title: string | null; institution: string | null; grades: { id: string; name: string }[] };
  errors: string[];
  warnings: string[];
  summary: { total_questions: number; rows_with_errors: number; skills_detected: number };
};

export type AnswerSheetImportDraft = {
  title: string | null;
  institution: string | null;
  gradeIds: string[];
  numQuestions: number;
  correctAnswers: Record<number, AnswerSheetLetter>;
  alternativesByQuestion: Record<number, AnswerSheetLetter[]>;
  blocks: AnswerSheetImportBlock[];
  questionSkills: Record<number, string[]>;
  skillCodes: Record<string, string>;
};

type GlobalAlternatives = 'sheet' | 'custom' | '3' | '4';

interface AnswerSheetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Séries já escolhidas no cadastro: priorizam habilidades com o mesmo código. */
  gradeIds: string[];
  minBlocks: number;
  maxBlocks: number;
  maxQuestionsPerBlock: number;
  onApply: (draft: AnswerSheetImportDraft) => void;
}

export function AnswerSheetImportDialog({
  open,
  onOpenChange,
  gradeIds,
  minBlocks,
  maxBlocks,
  maxQuestionsPerBlock,
  onApply,
}: AnswerSheetImportDialogProps) {
  const { toast } = useToast();
  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [alternativeCounts, setAlternativeCounts] = useState<Record<number, number>>({});
  const [globalAlternatives, setGlobalAlternatives] = useState<GlobalAlternatives>('sheet');

  const resetState = () => {
    setSource('file');
    setFile(null);
    setPasteText('');
    setPreview(null);
    setAlternativeCounts({});
    setGlobalAlternatives('sheet');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const countsFromSheet = (rows: PreviewRow[]): Record<number, number> =>
    Object.fromEntries(
      rows.filter((r) => r.question !== null).map((r) => [r.question as number, r.alternatives_count ?? DEFAULT_ALTERNATIVES])
    );

  const handleFileChange = (selected: File | null) => {
    setPreview(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      toast({ title: 'Formato não suportado', description: 'Selecione um arquivo CSV, XLS ou XLSX.', variant: 'destructive' });
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      toast({ title: 'Arquivo muito grande', description: 'O limite é 5 MB.', variant: 'destructive' });
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      let response;
      if (source === 'file') {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        gradeIds.forEach((id) => formData.append('grade_ids', id));
        response = await api.post<PreviewResponse>('/answer-sheets/import/preview', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await api.post<PreviewResponse>('/answer-sheets/import/preview', { text: pasteText, grade_ids: gradeIds });
      }
      setPreview(response.data);
      setAlternativeCounts(countsFromSheet(response.data.rows));
      setGlobalAlternatives('sheet');
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error || 'Não foi possível ler os dados.'
        : 'Não foi possível ler os dados.';
      toast({ title: 'Erro na importação', description: message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGlobalAlternativesChange = (value: GlobalAlternatives) => {
    if (!preview) return;
    setGlobalAlternatives(value);
    if (value === 'sheet') {
      setAlternativeCounts(countsFromSheet(preview.rows));
    } else if (value !== 'custom') {
      const count = Number(value);
      setAlternativeCounts(Object.fromEntries(Object.keys(alternativeCounts).map((q) => [Number(q), count])));
    }
  };

  const changeQuestionAlternatives = (question: number, delta: number) => {
    setAlternativeCounts((prev) => {
      const next = Math.min(MAX_SUPPORTED_ALTERNATIVES, Math.max(MIN_ALTERNATIVES, (prev[question] ?? DEFAULT_ALTERNATIVES) + delta));
      return { ...prev, [question]: next };
    });
    setGlobalAlternatives('custom');
  };

  const rowErrors = (row: PreviewRow): string[] => {
    const errors = [...row.errors];
    if (row.question === null) return errors;
    const count = alternativeCounts[row.question] ?? DEFAULT_ALTERNATIVES;
    if (count > MAX_SUPPORTED_ALTERNATIVES) {
      errors.push(`${UNSUPPORTED_ALTERNATIVE_NOTICE} Reduza para até ${MAX_SUPPORTED_ALTERNATIVES}.`);
    } else if (row.answer && LETTERS.indexOf(row.answer as (typeof LETTERS)[number]) >= count) {
      errors.push(`Resposta ${row.answer} fora das alternativas (A–${LETTERS[count - 1]}).`);
    }
    return errors;
  };

  const generalErrors = useMemo(() => {
    if (!preview) return [];
    const errors = [...preview.errors];
    const total = preview.rows.length;
    if (total > maxBlocks * maxQuestionsPerBlock) {
      errors.push(`Máximo de ${maxBlocks * maxQuestionsPerBlock} questões por cartão-resposta.`);
    }
    if (preview.blocks.length > 0 && preview.blocks.length < minBlocks && total > maxQuestionsPerBlock) {
      errors.push(`Com uma única disciplina, o máximo é ${maxQuestionsPerBlock} questões. Divida em ${minBlocks} ou mais disciplinas.`);
    }
    if (preview.blocks.length >= minBlocks) {
      preview.blocks
        .filter((b) => b.questions_count > maxQuestionsPerBlock)
        .forEach((b) => errors.push(`${b.subject_name}: ${b.questions_count} questões (máximo ${maxQuestionsPerBlock} por bloco).`));
    }
    return errors;
  }, [preview, minBlocks, maxBlocks, maxQuestionsPerBlock]);

  const rowsWithErrors = preview ? preview.rows.filter((r) => rowErrors(r).length > 0).length : 0;
  const canApply = !!preview && preview.rows.length > 0 && generalErrors.length === 0 && rowsWithErrors === 0;

  const handleApply = () => {
    if (!preview || !canApply) return;
    const rows = preview.rows as (PreviewRow & { question: number; answer: AnswerSheetLetter })[];
    const withSkill = rows.filter((r) => r.skill);
    onApply({
      title: preview.metadata.title,
      institution: preview.metadata.institution,
      gradeIds: preview.metadata.grades.map((g) => g.id),
      numQuestions: rows.length,
      correctAnswers: Object.fromEntries(rows.map((r) => [r.question, r.answer])),
      alternativesByQuestion: Object.fromEntries(
        rows.map((r) => [r.question, LETTERS.slice(0, alternativeCounts[r.question] ?? DEFAULT_ALTERNATIVES) as AnswerSheetLetter[]])
      ),
      blocks: preview.blocks,
      questionSkills: Object.fromEntries(withSkill.map((r) => [r.question, [r.skill!.id]])),
      skillCodes: Object.fromEntries(withSkill.map((r) => [r.skill!.id, r.skill!.code])),
    });
    handleOpenChange(false);
  };

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const answers = XLSX.utils.aoa_to_sheet([
        ['Questão', 'Resposta', 'Disciplina', 'Habilidade', 'Alternativas'],
        [1, 'B', 'Língua Portuguesa', 'EF05LP01', 4],
        [2, 'D', 'Língua Portuguesa', '', ''],
        [3, 'A', 'Matemática', 'EF05MA01', 3],
      ]);
      answers['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 14 }];
      const data = XLSX.utils.aoa_to_sheet([
        ['Campo', 'Valor'],
        ['Título', ''],
        ['Secretaria', ''],
        ['Séries', '5º Ano'],
      ]);
      data['!cols'] = [{ wch: 14 }, { wch: 40 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, answers, 'Gabarito');
      XLSX.utils.book_append_sheet(workbook, data, 'Dados');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_cartao_resposta.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível gerar o modelo.', variant: 'destructive' });
    }
  };

  const canAnalyze = source === 'file' ? !!file : pasteText.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar cartão-resposta</DialogTitle>
          <DialogDescription>
            Colunas obrigatórias: Questão, Resposta e Disciplina. Opcionais: Habilidade (código BNCC) e Alternativas
            (número ou letras, ex.: 4 ou A,B,C,D). Os dados importados substituem o que já foi preenchido no cadastro.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={source} onValueChange={(v) => { setSource(v as 'file' | 'paste'); setPreview(null); }}>
          <TabsList>
            <TabsTrigger value="file"><FileSpreadsheet className="mr-2 h-4 w-4" />Planilha</TabsTrigger>
            <TabsTrigger value="paste"><ClipboardPaste className="mr-2 h-4 w-4" />Colar do Excel</TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="answer-sheet-import-file">Arquivo (.xlsx, .xls ou .csv)</Label>
                <Input
                  id="answer-sheet-import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  className="max-w-sm"
                />
              </div>
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Baixar modelo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Na planilha, a aba &quot;Dados&quot; (opcional) pode trazer Título, Secretaria e Séries.
            </p>
          </TabsContent>
          <TabsContent value="paste" className="space-y-2">
            <Label htmlFor="answer-sheet-import-paste">Conteúdo copiado do Excel</Label>
            <Textarea
              id="answer-sheet-import-paste"
              rows={8}
              value={pasteText}
              onChange={(e) => { setPasteText(e.target.value); setPreview(null); }}
              placeholder={'Questão\tResposta\tDisciplina\tHabilidade\tAlternativas\n1\tB\tLíngua Portuguesa\tEF05LP01\t4'}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Selecione as células no Excel (com o cabeçalho) e cole aqui. Sem cabeçalho, use a ordem: Questão,
              Resposta, Disciplina, Habilidade, Alternativas.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button type="button" onClick={handleAnalyze} disabled={!canAnalyze || isAnalyzing}>
            {isAnalyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analisando...</> : 'Analisar'}
          </Button>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{preview.summary.total_questions} questões</Badge>
              <Badge variant="secondary">{preview.summary.skills_detected} habilidades detectadas</Badge>
              {rowsWithErrors > 0 && <Badge variant="destructive">{rowsWithErrors} com erro</Badge>}
              {preview.blocks.length > 0 && (
                <span className="text-muted-foreground">
                  {preview.blocks.map((b) => `${b.subject_name} (Q${b.start_question}–${b.end_question})`).join(' · ')}
                </span>
              )}
            </div>

            {(preview.metadata.title || preview.metadata.institution || preview.metadata.grades.length > 0) && (
              <p className="text-sm text-muted-foreground">
                {[
                  preview.metadata.title && `Título: ${preview.metadata.title}`,
                  preview.metadata.institution && `Secretaria: ${preview.metadata.institution}`,
                  preview.metadata.grades.length > 0 && `Séries: ${preview.metadata.grades.map((g) => g.name).join(', ')}`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}

            {generalErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalErrors.join(' ')}</AlertDescription>
              </Alert>
            )}
            {preview.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{preview.warnings.join(' ')}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Label>Alternativas</Label>
              <Select value={globalAlternatives} onValueChange={(v) => handleGlobalAlternativesChange(v as GlobalAlternatives)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sheet">Conforme a planilha</SelectItem>
                  <SelectItem value="3">Todas com 3 (A–C)</SelectItem>
                  <SelectItem value="4">Todas com 4 (A–D)</SelectItem>
                  <SelectItem value="5" disabled>Todas com 5 (A–E) — indisponível</SelectItem>
                  <SelectItem value="custom" disabled>Personalizado por questão</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{UNSUPPORTED_ALTERNATIVE_NOTICE}</span>
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Questão</TableHead>
                    <TableHead className="w-20">Resposta</TableHead>
                    <TableHead className="w-40">Alternativas</TableHead>
                    <TableHead>Disciplina</TableHead>
                    <TableHead>Habilidade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => {
                    const errors = rowErrors(row);
                    const count = row.question !== null ? alternativeCounts[row.question] ?? DEFAULT_ALTERNATIVES : null;
                    return (
                      <TableRow key={row.line}>
                        <TableCell className="font-medium">{row.question ?? '—'}</TableCell>
                        <TableCell>{row.answer ?? '—'}</TableCell>
                        <TableCell>
                          {row.question !== null && count !== null && (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => changeQuestionAlternatives(row.question as number, -1)}
                                disabled={count <= MIN_ALTERNATIVES}
                                aria-label={`Remover alternativa da questão ${row.question}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center text-xs font-mono">A–{LETTERS[count - 1]}</span>
                              <span title={count >= MAX_SUPPORTED_ALTERNATIVES ? UNSUPPORTED_ALTERNATIVE_NOTICE : undefined}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => changeQuestionAlternatives(row.question as number, 1)}
                                  disabled={count >= MAX_SUPPORTED_ALTERNATIVES}
                                  aria-label={`Adicionar alternativa na questão ${row.question}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{row.subject?.name || row.subject_input || '—'}</TableCell>
                        <TableCell>
                          {row.skill ? (
                            <span className="font-mono text-xs" title={row.skill.description}>{row.skill.code}</span>
                          ) : (
                            <span className="text-muted-foreground">{row.skill_input || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {errors.length > 0 ? (
                            <span className="text-destructive">{errors.join(' ')}</span>
                          ) : row.warnings.length > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">{row.warnings.join(' ')}</span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="OK" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button type="button" onClick={handleApply} disabled={!canApply}>Aplicar ao cadastro</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
