import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { generateEmailFromName, generatePasswordFromName } from "@/hooks/useEmailCheck";
import { CheckCircle2, AlertCircle, Loader2, Users, GraduationCap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  extractCreatedId,
  linkStudentToSupportLevel,
} from "@/lib/subturma";

interface BulkCreateStudentsByListModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  classId: string;
  className: string;
  gradeId?: string;
  gradeName?: string;
  allowSupportLevel?: boolean;
  existingNames?: string[];
  onSuccess: () => void;
}

interface StudentBulkResult {
  nome: string;
  email: string;
  senha: string;
  success: boolean;
  error?: string;
  adap?: string;
}

const getTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getApiMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: Record<string, unknown> } }).response?.data;
    if (data) {
      const message = data.erro ?? data.error ?? data.message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export function BulkCreateStudentsByListModal({
  isOpen,
  onClose,
  schoolName,
  classId,
  className,
  gradeId,
  gradeName,
  allowSupportLevel = true,
  existingNames = [],
  onSuccess,
}: BulkCreateStudentsByListModalProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [supportLevel, setSupportLevel] = useState("regular");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<StudentBulkResult[]>([]);
  const [namesAwaitingConfirm, setNamesAwaitingConfirm] = useState<string[]>([]);

  const parsedNames = useMemo(
    () =>
      input
        .split("\n")
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    [input]
  );

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  useEffect(() => {
    if (!isOpen) {
      setInput("");
      setSupportLevel("regular");
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
      setResults([]);
      setNamesAwaitingConfirm([]);
    }
  }, [isOpen]);

  const normalizePersonName = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const findNamesAlreadyInClass = (names: string[]) => {
    const existing = new Set(existingNames.map(normalizePersonName).filter(Boolean));
    const seen = new Set<string>();
    const matches: string[] = [];
    for (const name of names) {
      const key = normalizePersonName(name);
      if (!key || !existing.has(key) || seen.has(key)) continue;
      seen.add(key);
      matches.push(name.trim());
    }
    return matches;
  };

  const resolveEmail = async (name: string): Promise<string> => {
    const baseEmail = generateEmailFromName(name);
    if (!baseEmail) throw new Error("Não foi possível gerar email para o nome informado.");
    const { data } = await api.post("/users/check-email", { email: baseEmail });
    if (data?.disponivel) return baseEmail;
    return data?.email_sugerido || baseEmail;
  };

  const executeCreateBatch = async () => {
    if (!gradeId) {
      toast({
        title: "Série não identificada",
        description: "Não foi possível identificar a série da turma selecionada.",
        variant: "destructive",
      });
      return;
    }

    if (parsedNames.length === 0) {
      toast({
        title: "Lista vazia",
        description: "Informe pelo menos um aluno, um por linha.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: parsedNames.length });
    const today = getTodayDate();
    const output: StudentBulkResult[] = [];
    const level = allowSupportLevel && supportLevel !== "regular" ? Number(supportLevel) : null;

    for (const nome of parsedNames) {
      try {
        const email = await resolveEmail(nome);
        const senha = generatePasswordFromName(nome);

        const response = await api.post("/students", {
          name: nome,
          email,
          password: senha,
          birth_date: today,
          class_id: classId,
          grade_id: gradeId,
        });

        let adap: string | undefined;
        if (level) {
          const studentId = extractCreatedId(response.data);
          if (!studentId) {
            adap = "Ficou na turma regular. O nível ADAP não foi vinculado.";
          } else {
            try {
              await linkStudentToSupportLevel(classId, studentId, level);
              adap = `ADAP ${level}`;
            } catch (linkError: unknown) {
              adap = getApiMessage(linkError, "Ficou na turma regular. O nível ADAP não foi vinculado.");
            }
          }
        }

        output.push({ nome, email, senha, success: true, adap });
      } catch (error: unknown) {
        output.push({
          nome,
          email: generateEmailFromName(nome),
          senha: generatePasswordFromName(nome),
          success: false,
          error: getApiMessage(error, "Erro ao criar aluno na turma."),
        });
      }

      setProgress((prev) => ({ ...prev, current: Math.min(prev.current + 1, prev.total) }));
    }

    setResults(output);
    setIsProcessing(false);

    const successCount = output.filter((item) => item.success).length;
    const adapMissed = output.filter((item) => item.success && item.adap && !item.adap.startsWith("ADAP")).length;

    toast({
      title: "Processo finalizado",
      description:
        adapMissed > 0
          ? `${successCount} de ${output.length} aluno(s) na turma regular. ${adapMissed} sem o nível ADAP.`
          : level
            ? `${successCount} de ${output.length} aluno(s) criado(s) em ADAP ${level}.`
            : `${successCount} de ${output.length} aluno(s) criado(s) na turma.`,
      variant: successCount > 0 && adapMissed === 0 ? "default" : "destructive",
    });

    if (successCount > 0) {
      onSuccess();
      onClose();
    }
  };

  const handleCreateBatch = () => {
    if (!gradeId) {
      toast({
        title: "Série não identificada",
        description: "Não foi possível identificar a série da turma selecionada.",
        variant: "destructive",
      });
      return;
    }

    if (parsedNames.length === 0) {
      toast({
        title: "Lista vazia",
        description: "Informe pelo menos um aluno, um por linha.",
        variant: "destructive",
      });
      return;
    }

    const duplicates = findNamesAlreadyInClass(parsedNames);
    if (duplicates.length > 0) {
      setNamesAwaitingConfirm(duplicates);
      return;
    }

    void executeCreateBatch();
  };

  const successCount = results.filter((item) => item.success).length;
  const errorCount = results.filter((item) => !item.success).length;

  return (
    <>
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (isProcessing) {
          toast({
            title: "Processamento em andamento",
            description: "Aguarde finalizar para evitar inconsistências.",
            variant: "destructive",
          });
          return;
        }
        onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-4xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            Alunos em lote (lista)
          </DialogTitle>
          <DialogDescription>
            Escola: {schoolName} • Turma: {className}
            {gradeName ? ` • Série: ${gradeName}` : ""}. Um nome por linha para criar alunos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de alunos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allowSupportLevel ? (
                <div className="space-y-2">
                  <Label htmlFor="students-bulk-support">Nível de suporte</Label>
                  <Select value={supportLevel} onValueChange={setSupportLevel} disabled={isProcessing}>
                    <SelectTrigger id="students-bulk-support" className="w-full sm:w-[240px]">
                      <SelectValue placeholder="Somente turma regular" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Somente turma regular</SelectItem>
                      <SelectItem value="1">ADAP 1</SelectItem>
                      <SelectItem value="2">ADAP 2</SelectItem>
                      <SelectItem value="3">ADAP 3</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    A lista entra na turma. Com um nível, entra também nesse ADAP.
                  </p>
                </div>
              ) : null}
              <Label htmlFor="students-bulk-list">Um nome por linha</Label>
              <Textarea
                id="students-bulk-list"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={"Maria Silva\nJoao Pereira\nAna Souza"}
                className="min-h-[180px]"
              />
              <p className="text-sm text-muted-foreground">{parsedNames.length} nome(s) válido(s).</p>

              {isProcessing && (
                <div className="space-y-2 border rounded-md p-3 bg-green-50/70 dark:bg-green-950/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Adicionando alunos na turma...</span>
                    <span>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <Progress value={progressPercent} />
                  <p className="text-xs text-muted-foreground">
                    Não feche a aba até a conclusão do processamento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-green-600" />
                  Resultado do lote
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                    {successCount} sucesso
                  </Badge>
                  {errorCount > 0 && <Badge variant="destructive">{errorCount} com erro</Badge>}
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {results.map((item, index) => (
                    <div
                      key={`${item.nome}-${index}`}
                      className="border rounded-md p-3 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-sm">{item.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.email}</p>
                        {item.success ? (
                          <>
                            <p className="text-xs text-muted-foreground">Senha: {item.senha}</p>
                            {item.adap ? <p className="text-xs text-muted-foreground">{item.adap}</p> : null}
                          </>
                        ) : (
                          <p className="text-xs text-red-600">{item.error}</p>
                        )}
                      </div>
                      {item.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreateBatch}
            disabled={isProcessing || parsedNames.length === 0 || !gradeId}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar alunos em lote
          </Button>
        </div>
      </DialogContent>
    </Dialog>

      <AlertDialog
        open={namesAwaitingConfirm.length > 0}
        onOpenChange={(open) => {
          if (!open && !isProcessing) setNamesAwaitingConfirm([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nomes já na turma</AlertDialogTitle>
            <AlertDialogDescription>
              Os seguintes nomes já estão na lista:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-40 overflow-y-auto px-6 text-sm space-y-1">
            {namesAwaitingConfirm.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="px-6 text-sm font-medium">Adicionar mesmo assim?</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Não</AlertDialogCancel>
            <Button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                setNamesAwaitingConfirm([]);
                void executeCreateBatch();
              }}
            >
              Sim
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
