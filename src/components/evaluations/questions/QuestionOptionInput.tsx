import React, { useRef, useCallback, useState } from 'react';
import { Image as ImageIcon, Sigma, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LatexInsertDialog } from './LatexInsertDialog';
import { OptionImageInsertDialog } from './OptionImageInsertDialog';
import { QuestionOptionContent } from './QuestionOptionContent';
import { BASE_URL } from '@/lib/api';
import type { QuestionOptionImageForm } from '@/types/question-option';

export interface QuestionOptionInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  image?: QuestionOptionImageForm | null;
  onImageChange?: (image: QuestionOptionImageForm | null) => void;
  showPreview?: boolean;
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (el: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') ref(el);
      else (ref as React.MutableRefObject<T | null>).current = el;
    });
  };
}

export const QuestionOptionInput = React.forwardRef<
  HTMLInputElement,
  QuestionOptionInputProps
>(function QuestionOptionInput(
  {
    value,
    onChange,
    image,
    onImageChange,
    showPreview = true,
    className,
    ...rest
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [latexOpen, setLatexOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const input = inputRef.current;
      if (!input) {
        onChange(value + snippet);
        return;
      }
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const newVal = value.slice(0, start) + snippet + value.slice(end);
      onChange(newVal);
      setTimeout(() => {
        input.focus();
        const pos = start + snippet.length;
        input.setSelectionRange(pos, pos);
      }, 0);
    },
    [value, onChange]
  );

  const handleRemoveImage = () => {
    onImageChange?.(null);
  };

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <div className="flex items-center gap-2 w-full">
        <Input
          {...rest}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          ref={mergeRefs(ref, inputRef)}
          className={className ? `${className} flex-1 min-w-0` : 'flex-1 min-w-0'}
        />
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setLatexOpen(true)}
                aria-label="Inserir expressão LaTeX"
              >
                <Sigma className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Inserir expressão matemática (LaTeX)</p>
            </TooltipContent>
          </Tooltip>

          {onImageChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                  onClick={() => setImageOpen(true)}
                  aria-label="Inserir imagem"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inserir imagem na alternativa</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {image && (
        <div className="flex items-start gap-2 p-2 rounded-lg border border-border bg-muted/20">
          <div className="flex-1 min-w-0">
            <QuestionOptionContent
              text=""
              image={image}
              apiBase={BASE_URL}
              textClassName="text-sm"
            />
          </div>
          {onImageChange && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0 text-red-600 hover:text-red-700"
              onClick={handleRemoveImage}
              aria-label="Remover imagem"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {showPreview && value.trim() && (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Preview</p>
          <QuestionOptionContent
            text={value}
            apiBase={BASE_URL}
            textClassName="text-sm"
          />
        </div>
      )}

      <LatexInsertDialog
        open={latexOpen}
        onOpenChange={setLatexOpen}
        onInsert={insertAtCursor}
      />

      {onImageChange && (
        <OptionImageInsertDialog
          open={imageOpen}
          onOpenChange={setImageOpen}
          initialPreview={image?.kind === 'new' ? image.dataUrl : undefined}
          onConfirm={(nextImage) => onImageChange(nextImage)}
        />
      )}
    </div>
  );
});
