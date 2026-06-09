import React, { useCallback, useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
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

const LATEX_SHORTCUTS: { label: string; latex: string; title: string }[] = [
  { label: 'x²', latex: 'x^{2}', title: 'Expoente' },
  { label: '√', latex: '\\sqrt{}', title: 'Raiz quadrada' },
  { label: '∛', latex: '\\sqrt[3]{}', title: 'Raiz cúbica' },
  { label: 'a/b', latex: '\\frac{}{}', title: 'Fração' },
  { label: 'π', latex: '\\pi', title: 'Pi' },
  { label: '≤', latex: '\\le', title: 'Menor ou igual' },
  { label: '≥', latex: '\\ge', title: 'Maior ou igual' },
  { label: '≠', latex: '\\neq', title: 'Diferente' },
  { label: '∞', latex: '\\infty', title: 'Infinito' },
  { label: 'Σ', latex: '\\sum', title: 'Somatório' },
  { label: '∫', latex: '\\int', title: 'Integral' },
];

function getCursorInsideFirstBraces(snippet: string): { selectStart: number; selectEnd: number } | undefined {
  const emptyBracesIndex = snippet.indexOf('{}');
  if (emptyBracesIndex === -1) return undefined;
  return { selectStart: emptyBracesIndex, selectEnd: emptyBracesIndex };
}

interface LatexInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (wrappedLatex: string) => void;
}

export function LatexInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: LatexInsertDialogProps) {
  const [latex, setLatex] = useState('x^{2}');
  const [previewHtml, setPreviewHtml] = useState('');
  const latexInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    try {
      setPreviewHtml(
        katex.renderToString(latex || '', {
          throwOnError: false,
          displayMode: false,
        })
      );
    } catch {
      setPreviewHtml('');
    }
  }, [latex, open]);

  const insertAtCursor = useCallback((snippet: string) => {
    const input = latexInputRef.current;
    const cursorInsideBraces = getCursorInsideFirstBraces(snippet);

    if (!input) {
      setLatex((prev) => prev + snippet);
      return;
    }

    const currentValue = input.value;
    const start = input.selectionStart ?? currentValue.length;
    const end = input.selectionEnd ?? currentValue.length;
    const newVal = currentValue.slice(0, start) + snippet + currentValue.slice(end);
    setLatex(newVal);

    setTimeout(() => {
      input.focus();
      if (cursorInsideBraces) {
        const cursorStart = start + cursorInsideBraces.selectStart;
        input.setSelectionRange(cursorStart, cursorStart);
      } else {
        const cursorPos = start + snippet.length;
        input.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  }, []);

  const handleInsert = () => {
    const trimmed = latex.trim();
    if (!trimmed) return;
    onInsert(`$${trimmed}$`);
    onOpenChange(false);
    setLatex('x^{2}');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setLatex('x^{2}');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Inserir expressão matemática (LaTeX)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="latex-input">LaTeX</Label>
            <Input
              id="latex-input"
              ref={latexInputRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="Ex: x^{2}, \\frac{a}{b}"
              className="font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {LATEX_SHORTCUTS.map((shortcut) => (
              <Button
                key={shortcut.latex}
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 min-w-8 px-2 font-medium"
                title={shortcut.title}
                onClick={() => insertAtCursor(shortcut.latex)}
              >
                {shortcut.label}
              </Button>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-6 min-h-[80px] flex items-center justify-center">
            {previewHtml ? (
              <div
                className="text-foreground text-xl"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <span className="text-sm text-muted-foreground">Preview da expressão</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleInsert} disabled={!latex.trim()}>
            Inserir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
