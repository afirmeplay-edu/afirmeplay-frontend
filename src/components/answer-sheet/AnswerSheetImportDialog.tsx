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
  question_input: string;
  answer: string | null;
  answer_input: string;
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

/** Valores editáveis de uma linha da pré-visualização (revalidados no backend ao reanalisar). */
type RowFields = { question: string; answer: string; subject: string; skill: string };

const PREVIEW_URL = '/answer-sheets/import/preview';

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
  /** Quantidade de alternativas por linha da pré-visualização (chave: row.line). */
  const [alternativeCounts, setAlternativeCounts] = useState<Record<number, number>>({});
  const [globalAlternatives, setGlobalAlternatives] = useState<GlobalAlternatives>('sheet');
  /** Linhas editadas e ainda não reanalisadas (chave: row.line). */
  const [edits, setEdits] = useState<Record<number, RowFields>>({});
  const hasPendingEdits = Object.keys(edits).length > 0;

  const clearPreview = () => {
    setPreview(null);
    setAlternativeCounts({});
    setGlobalAlternatives('sheet');
    setEdits({});
  };

  const resetState = () => {
    setSource('file');
    setFile(null);
    setPasteText('');
    clearPreview();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const countsFromSheet = (rows: PreviewRow[]): Record<number, number> =>
    Object.fromEntries(rows.map((r) => [r.line, r.alternatives_count ?? DEFAULT_ALTERNATIVES]));

  const rowFields = (row: PreviewRow): RowFields =>
    edits[row.line] ?? {
      question: row.question_input ?? String(row.question ?? ''),
      answer: row.answer_input ?? row.answer ?? '',
      subject: row.subject?.name || row.subject_input || '',
      skill: row.skill?.code || row.skill_input || '',
    };

  const updateRowField = (row: PreviewRow, field: keyof RowFields, value: string) => {
    setEdits((prev) => ({ ...prev, [row.line]: { ...rowFields(row), [field]: value } }));
  };

  const handleFileChange = (selected: File | null) => {
    clearPreview();
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

  const runPreview = async (request: () => Promise<{ data: PreviewResponse }>, keepMetadataFrom?: PreviewResponse) => {
    try {
      setIsAnalyzing(true);
      const { data } = await request();
      setPreview(keepMetadataFrom ? { ...data, metadata: keepMetadataFrom.metadata, warnings: keepMetadataFrom.warnings } : data);
      setAlternativeCounts(countsFromSheet(data.rows));
      setGlobalAlternatives('sheet');
      setEdits({});
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error || 'Não foi possível ler os dados.'
        : 'Não foi possível ler os dados.';
      toast({ title: 'Erro na importação', description: message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = () => {
    if (source === 'file') {
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      gradeIds.forEach((id) => formData.append('grade_ids', id));
      return runPreview(() =>
        api.post<PreviewResponse>(PREVIEW_URL, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      );
    }
    return runPreview(() => api.post<PreviewResponse>(PREVIEW_URL, { text: pasteText, grade_ids: gradeIds }));
  };

  /** Reenvia a tabela editada como texto tabulado; Título/Secretaria/Séries da leitura original são mantidos. */
  const handleReanalyze = () => {
    if (!preview) return;
    const clean = (value: string | number) => String(value).replace(/[\t\r\n]+/g, ' ').trim();
    const lines = preview.rows.map((row) => {
      const fields = rowFields(row);
      const count = alternativeCounts[row.line] ?? DEFAULT_ALTERNATIVES;
      return [fields.question, fields.answer, fields.subject, fields.skill, count].map(clean).join('\t');
    });
    const text = ['Questão\tResposta\tDisciplina\tHabilidade\tAlternativas', ...lines].join('\n');
    return runPreview(() => api.post<PreviewResponse>(PREVIEW_URL, { text, grade_ids: gradeIds }), preview);
  };

  const handleGlobalAlternativesChange = (value: GlobalAlternatives) => {
    if (!preview) return;
    setGlobalAlternatives(value);
    if (value === 'sheet') {
      setAlternativeCounts(countsFromSheet(preview.rows));
    } else if (value !== 'custom') {
      const count = Number(value);
      setAlternativeCounts(Object.fromEntries(preview.rows.map((r) => [r.line, count])));
    }
  };

  const changeRowAlternatives = (line: number, delta: number) => {
    setAlternativeCounts((prev) => {
      const next = Math.min(MAX_SUPPORTED_ALTERNATIVES, Math.max(MIN_ALTERNATIVES, (prev[line] ?? DEFAULT_ALTERNATIVES) + delta));
      return { ...prev, [line]: next };
    });
    setGlobalAlternatives('custom');
  };

  const rowErrors = (row: PreviewRow): string[] => {
    const errors = [...row.errors];
    const count = alternativeCounts[row.line] ?? DEFAULT_ALTERNATIVES;
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
    const alreadyBlocked = errors.some((error) => error.includes('Não cabe neste cartão'));
    if (!alreadyBlocked && total > maxBlocks * maxQuestionsPerBlock) {
      errors.push(
        `Não cabe neste cartão: ${total} questões e o máximo é ${maxBlocks * maxQuestionsPerBlock} (4 blocos de ${maxQuestionsPerBlock}). Reduza as questões ou separe em outro cartão.`
      );
    }
    if (!alreadyBlocked) {
      preview.blocks
        .filter((b) => b.questions_count > maxQuestionsPerBlock)
        .forEach((b) => errors.push(`${b.subject_name}: ${b.questions_count} questões não cabem em um bloco (máximo ${maxQuestionsPerBlock}).`));
    }
    return errors;
  }, [preview, maxBlocks, maxQuestionsPerBlock]);

  const rowsWithErrors = preview ? preview.rows.filter((r) => rowErrors(r).length > 0).length : 0;
  const canApply =
    !!preview && preview.rows.length > 0 && !hasPendingEdits && generalErrors.length === 0 && rowsWithErrors === 0;

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
        rows.map((r) => [r.question, LETTERS.slice(0, alternativeCounts[r.line] ?? DEFAULT_ALTERNATIVES) as AnswerSheetLetter[]])
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

        {preview ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Origem: {source === 'file' ? file?.name ?? 'planilha' : 'conteúdo colado do Excel'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { clearPreview(); if (source === 'file') setFile(null); }}
              disabled={isAnalyzing}
            >
              Usar outros dados
            </Button>
          </div>
        ) : (
        <>
        <Tabs value={source} onValueChange={(v) => { setSource(v as 'file' | 'paste'); clearPreview(); }}>
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
              onChange={(e) => setPasteText(e.target.value)}
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
        </>
        )}

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
                    const fields = rowFields(row);
                    const isEdited = !!edits[row.line];
                    const count = alternativeCounts[row.line] ?? DEFAULT_ALTERNATIVES;
                    const label = `linha ${row.line}`;
                    return (
                      <TableRow key={row.line}>
                        <TableCell>
                          <Input
                            value={fields.question}
                            onChange={(e) => updateRowField(row, 'question', e.target.value)}
                            className="h-8 w-14 px-2"
                            inputMode="numeric"
                            aria-label={`Questão (${label})`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={fields.answer}
                            onChange={(e) => updateRowField(row, 'answer', e.target.value.toUpperCase())}
                            className="h-8 w-12 px-2 text-center font-semibold"
                            maxLength={3}
                            aria-label={`Resposta (${label})`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => changeRowAlternatives(row.line, -1)}
                              disabled={count <= MIN_ALTERNATIVES}
                              aria-label={`Remover alternativa (${label})`}
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
                                onClick={() => changeRowAlternatives(row.line, 1)}
                                disabled={count >= MAX_SUPPORTED_ALTERNATIVES}
                                aria-label={`Adicionar alternativa (${label})`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={fields.subject}
                            onChange={(e) => updateRowField(row, 'subject', e.target.value)}
                            className="h-8 min-w-[140px] px-2"
                            aria-label={`Disciplina (${label})`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={fields.skill}
                            onChange={(e) => updateRowField(row, 'skill', e.target.value)}
                            className="h-8 w-28 px-2 font-mono text-xs"
                            title={row.skill?.description}
                            aria-label={`Habilidade (${label})`}
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          {isEdited ? (
                            <span className="text-amber-600 dark:text-amber-400">Alterada — clique em Reanalisar.</span>
                          ) : errors.length > 0 ? (
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasPendingEdits && (
                <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">
                  Há linhas alteradas. Reanalise para validar disciplina, habilidade e respostas.
                </span>
              )}
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button type="button" variant="outline" onClick={handleReanalyze} disabled={!hasPendingEdits || isAnalyzing}>
                {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reanalisar
              </Button>
              <Button type="button" onClick={handleApply} disabled={!canApply}>Aplicar ao cadastro</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
