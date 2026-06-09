import React from 'react';
import { cn } from '@/lib/utils';
import { renderMathInText } from '@/utils/renderMath';
import {
  getOptionImageDimensions,
  getOptionImageDisplaySrc,
  optionHasContent,
} from '@/utils/questionOptionImages';
import type { QuestionOptionImageDisplay } from '@/types/question-option';

interface QuestionOptionContentProps {
  text?: string;
  image?: QuestionOptionImageDisplay;
  questionId?: string;
  apiBase: string;
  className?: string;
  textClassName?: string;
}

export function QuestionOptionContent({
  text,
  image,
  questionId,
  apiBase,
  className,
  textClassName,
}: QuestionOptionContentProps) {
  const imageSrc = getOptionImageDisplaySrc(image, questionId, apiBase);
  const { width, height } = getOptionImageDimensions(image);
  const hasText = Boolean(text?.trim());

  if (!optionHasContent({ text, image })) {
    return <span className="text-muted-foreground italic text-sm">Sem conteúdo</span>;
  }

  return (
    <div className={cn('flex flex-col gap-2 min-w-0', className)}>
      {hasText && (
        <div
          className={cn(
            'question-option-text leading-relaxed [&_.katex]:text-inherit',
            textClassName
          )}
          dangerouslySetInnerHTML={{ __html: renderMathInText(text!) }}
        />
      )}
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          className="max-w-full h-auto rounded-lg border border-border/50"
          style={{
            width: width ? `${width}px` : undefined,
            maxWidth: width ? `${width}px` : '100%',
            maxHeight: height ? `${height}px` : undefined,
          }}
        />
      )}
    </div>
  );
}
