import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAnswerSheetCorrection } from '@/hooks/useAnswerSheetCorrection';
import ManualCorrectionPanel from '@/components/answer-sheet/ManualCorrectionPanel';
import {
  ScanLine,
  Images,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Clock,
  FileText,
  FilePlus,
  Ticket,
  BarChart3,
  ClipboardList,
} from 'lucide-react';

const MAX_BATCH_IMAGES = 50;

export default function AnswerSheetCorrection() {
  const { toast } = useToast();
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Correção única
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessingSingle, setIsProcessingSingle] = useState(false);
  const [correctionProgress, setCorrectionProgress] = useState(0);
  const [isDragOverSingle, setIsDragOverSingle] = useState(false);

  // Correção em lote
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchImages, setBatchImages] = useState<{ file: File; preview: string }[]>([]);
  const [isDragOverBatch, setIsDragOverBatch] = useState(false);

  const {
    isProcessing: isBatchProcessing,
    isCompleted: isBatchCompleted,
    progress: batchProgress,
    error: batchError,
    startSingleCorrection,
    startBatchCorrection,
    reset: resetBatchCorrection,
  } = useAnswerSheetCorrection();

  // ——— Correção única ———
  const handleSingleFile = useCallback(
    (file: File | null) => {
      if (!file || !file.type.startsWith('image/')) return;
      setUploadedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    []
  );

  const handleSingleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleSingleFile(file || null);
    e.target.value = '';
  };

  const handleSingleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverSingle(false);
    handleSingleFile(e.dataTransfer.files?.[0] || null);
  };

  const handleSingleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverSingle(true);
  };

  const handleSingleDragLeave = () => setIsDragOverSingle(false);

  const handleProcessSingle = async () => {
    if (!uploadedImage) {
      toast({ title: 'Erro', description: 'Selecione uma imagem para corrigir.', variant: 'destructive' });
      return;
    }
    try {
      setIsProcessingSingle(true);
      setCorrectionProgress(0);
      const progressInterval = setInterval(() => {
        setCorrectionProgress((prev) => Math.min(prev + 15, 90));
      }, 300);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadedImage);
      });
      await startSingleCorrection(base64);
      clearInterval(progressInterval);
      setCorrectionProgress(100);
      setUploadedImage(null);
      setPreviewImage(null);
    } catch {
      // hook já exibe toast
    } finally {
      setIsProcessingSingle(false);
      setCorrectionProgress(0);
    }
  };

  const clearSingle = () => {
    setUploadedImage(null);
    setPreviewImage(null);
  };

  // ——— Correção em lote ———
  const addBatchFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const remaining = MAX_BATCH_IMAGES - batchImages.length;
      const toAdd = list.slice(0, remaining);
      if (list.length > remaining) {
        toast({
          title: 'Limite de imagens',
          description: `Máximo de ${MAX_BATCH_IMAGES} por lote. ${remaining} adicionadas.`,
          variant: 'destructive',
        });
      }
      Promise.all(
        toAdd.map(
          (file) =>
            new Promise<{ file: File; preview: string }>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ file, preview: reader.result as string });
              reader.readAsDataURL(file);
            })
        )
      ).then((newImages) => setBatchImages((prev) => [...prev, ...newImages]));
    },
    [batchImages.length, toast]
  );

  const handleBatchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) addBatchFiles(files);
    e.target.value = '';
    batchFileInputRef.current?.value && (batchFileInputRef.current.value = '');
  };

  const handleBatchDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverBatch(false);
    if (e.dataTransfer.files?.length) addBatchFiles(e.dataTransfer.files);
  };

  const handleBatchDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverBatch(true);
  };

  const handleBatchDragLeave = () => setIsDragOverBatch(false);

  const removeBatchImage = (index: number) => {
    setBatchImages((prev) => prev.filter((_, i) => i !== index));
  };

  const clearBatchImages = () => setBatchImages([]);

  const handleStartBatch = async () => {
    if (batchImages.length === 0) {
      toast({ title: 'Erro', description: 'Selecione pelo menos uma imagem.', variant: 'destructive' });
      return;
    }
    try {
      await startBatchCorrection(batchImages.map((img) => img.preview));
    } catch {
      // hook trata
    }
  };

  const handleCloseBatchDialog = () => {
    if (!isBatchProcessing) {
      setShowBatchDialog(false);
      setBatchImages([]);
      resetBatchCorrection();
    }
  };

  const quickLinks = [
    { icon: FilePlus, label: 'Cadastrar', href: '/app/cartao-resposta/cadastrar' },
    { icon: Ticket, label: 'Gerar cartões', href: '/app/cartao-resposta/gerar' },
    { icon: BarChart3, label: 'Resultados', href: '/app/resultados?aba=cartao' },
  ];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2">
          <ScanLine className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          Correção de Cartão Resposta
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Corrija por foto (QR code) ou registre as respostas manualmente em um cartão resposta.
        </p>
      </div>

      {/* Atalhos */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map(({ icon: Icon, label, href }) => (
          <Button key={href} variant="outline" size="sm" asChild>
            <Link to={href}>
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </Link>
          </Button>
        ))}
      </div>

      <Tabs defaultValue="omr" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="omr" className="gap-2">
            <ScanLine className="h-4 w-4" />
            Por imagem
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Entrada manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="omr" className="mt-0 space-y-0">
      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
        {/* Card: Correção única */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Um cartão
            </CardTitle>
            <CardDescription>
              Envie uma foto do cartão resposta preenchido para corrigir imediatamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!previewImage ? (
              <div
                onDrop={handleSingleDrop}
                onDragOver={handleSingleDragOver}
                onDragLeave={handleSingleDragLeave}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center transition-colors
                  ${isDragOverSingle ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                `}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">Arraste uma imagem aqui ou clique para escolher</p>
                <p className="text-xs text-muted-foreground mb-3">JPG, PNG, GIF ou WebP</p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleSingleInputChange}
                  className="cursor-pointer max-w-[200px] mx-auto"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border overflow-hidden bg-muted/30">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-auto max-h-56 object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearSingle} disabled={isProcessingSingle}>
                    <X className="h-4 w-4 mr-1" />
                    Trocar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleProcessSingle}
                    disabled={isProcessingSingle}
                  >
                    {isProcessingSingle ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando... {correctionProgress}%
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Corrigir
                      </>
                    )}
                  </Button>
                </div>
                {isProcessingSingle && (
                  <div className="space-y-2">
                    <Progress value={correctionProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      Analisando imagem e processando correção...
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card: Correção em lote */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Images className="h-5 w-5" />
              Vários cartões
            </CardTitle>
            <CardDescription>
              Processe de 1 a {MAX_BATCH_IMAGES} cartões de uma vez. O resultado aparece ao final.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog
              open={showBatchDialog}
              onOpenChange={(open) => {
                if (!open && !isBatchProcessing) handleCloseBatchDialog();
                else if (open) setShowBatchDialog(true);
              }}
            >
              <DialogTrigger asChild>
                <Button className="w-full" variant="secondary" size="lg">
                  <Upload className="h-4 w-4 mr-2" />
                  Abrir correção em lote
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Images className="h-5 w-5" />
                    Correção em lote
                  </DialogTitle>
                  <DialogDescription>
                    Selecione várias imagens de cartões resposta (máx. {MAX_BATCH_IMAGES}). O gabarito é identificado pelo QR code em cada imagem.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2 overflow-auto flex-1 min-h-0">
                  {!isBatchProcessing && !isBatchCompleted && (
                    <>
                      <div
                        onDrop={handleBatchDrop}
                        onDragOver={handleBatchDragOver}
                        onDragLeave={handleBatchDragLeave}
                        className={`
                          border-2 border-dashed rounded-xl p-6 text-center transition-colors
                          ${isDragOverBatch ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                        `}
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium mb-1">Arraste imagens ou clique para selecionar</p>
                        <Input
                          ref={batchFileInputRef}
                          id="batch-upload"
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleBatchInputChange}
                          className="cursor-pointer max-w-[220px] mx-auto mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          {batchImages.length}/{MAX_BATCH_IMAGES} imagens
                        </p>
                      </div>

                      {batchImages.length > 0 && (
                        <>
                          <div className="flex items-center justify-between">
                            <Label>Prévia</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={clearBatchImages}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Limpar
                            </Button>
                          </div>
                          <ScrollArea className="h-40 rounded-lg border p-2">
                            <div className="grid grid-cols-4 gap-2">
                              {batchImages.map((img, i) => (
                                <div key={i} className="relative group aspect-square">
                                  <img
                                    src={img.preview}
                                    alt={`Preview ${i + 1}`}
                                    className="w-full h-full object-cover rounded border"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeBatchImage(i)}
                                    className="absolute top-1 right-1 rounded-full bg-destructive text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <span className="absolute bottom-1 left-1 rounded bg-black/70 text-white text-xs px-1.5">
                                    {i + 1}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <Button
                            className="w-full"
                            onClick={handleStartBatch}
                            disabled={batchImages.length === 0}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Corrigir {batchImages.length} cartão(ões)
                          </Button>
                        </>
                      )}
                    </>
                  )}

                  {batchError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{batchError}</AlertDescription>
                    </Alert>
                  )}

                  {(isBatchProcessing || isBatchCompleted) && batchProgress && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {isBatchCompleted ? (
                            <>
                              <CheckCircle className="h-5 w-5 text-green-500" />
                              <span className="font-medium text-green-600">Concluído</span>
                            </>
                          ) : (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              <span className="font-medium">Processando...</span>
                            </>
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {batchProgress.completed}/{batchProgress.total} ({batchProgress.percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <Progress value={batchProgress.percentage} className="h-2" />
                      <ScrollArea className="h-48 rounded-lg border">
                        <div className="p-2 space-y-1">
                          {Object.entries(batchProgress.items || {}).map(([idx, item]) => (
                            <div
                              key={idx}
                              className={`
                                flex items-center justify-between p-2 rounded text-sm
                                ${item.status === 'pending' ? 'bg-muted/50' : ''}
                                ${item.status === 'processing' ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200' : ''}
                                ${item.status === 'done' ? 'bg-green-50 dark:bg-green-950/30 border border-green-200' : ''}
                                ${item.status === 'error' ? 'bg-destructive/10 border border-destructive/30' : ''}
                              `}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                {item.status === 'pending' && <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                {item.status === 'processing' && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                                {item.status === 'done' && <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />}
                                {item.status === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
                                <span className="truncate">
                                  {item.status === 'done' && item.student_name
                                    ? item.student_name
                                    : `Cartão ${Number(idx) + 1}`}
                                  {item.status === 'pending' && ' — Aguardando'}
                                  {item.status === 'processing' && ' — Processando'}
                                  {item.status === 'error' && item.error && ` — ${item.error}`}
                                </span>
                              </span>
                              {item.status === 'done' && (
                                <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">
                                  {item.correct}/{item.total} ({item.percentage?.toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      {isBatchCompleted && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="text-sm">
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              Sucesso: {batchProgress.successful}
                            </span>
                            {batchProgress.failed > 0 && (
                              <span className="text-destructive ml-2">Falhas: {batchProgress.failed}</span>
                            )}
                          </div>
                          <Button onClick={handleCloseBatchDialog}>Fechar</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="manual" className="mt-0 max-w-5xl">
          <ManualCorrectionPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
