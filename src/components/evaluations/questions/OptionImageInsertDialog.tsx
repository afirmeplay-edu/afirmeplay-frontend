import React, { useState } from 'react';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { fileToDataUrl } from '@/utils/questionOptionImages';
import type { QuestionOptionImageForm } from '@/types/question-option';

interface OptionImageInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (image: QuestionOptionImageForm) => void;
  initialPreview?: string;
}

export function OptionImageInsertDialog({
  open,
  onOpenChange,
  onConfirm,
  initialPreview,
}: OptionImageInsertDialogProps) {
  const [preview, setPreview] = useState(initialPreview ?? '');
  const [width, setWidth] = useState(300);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 10MB.');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (!preview) return;
    onConfirm({
      kind: 'new',
      dataUrl: preview,
      width,
    });
    onOpenChange(false);
    setPreview('');
    setWidth(300);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPreview(initialPreview ?? '');
      setWidth(300);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Inserir imagem na alternativa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Selecionar imagem</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="option-image-upload"
              />
              <label htmlFor="option-image-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">PNG, JPG, GIF até 10MB</span>
              </label>
            </div>
          </div>

          {preview && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-lg border border-border p-3 bg-muted/20 flex justify-center">
                <img
                  src={preview}
                  alt="Preview"
                  className="h-auto rounded-md"
                  style={{ maxWidth: `${width}px`, width: '100%' }}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Largura máxima: {width}px</Label>
            <Slider
              value={[width]}
              onValueChange={([value]) => setWidth(value)}
              min={80}
              max={600}
              step={10}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!preview}>
            Inserir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
