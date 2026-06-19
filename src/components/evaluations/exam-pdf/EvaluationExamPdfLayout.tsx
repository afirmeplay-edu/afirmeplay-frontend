import React from 'react';
import { BASE_URL } from '@/lib/api';
import { getQuestionHtmlForDisplay } from '@/utils/questionImages';
import { cleanLegacyText, isLikelyPlainText } from '@/utils/textFormatter';
import { renderMathInText } from '@/utils/renderMath';
import {
  getOptionImageDimensions,
  getOptionImageDisplaySrc,
  optionHasContent,
} from '@/utils/questionOptionImages';
import type { QuestionOptionImageDisplay } from '@/types/question-option';
import 'katex/dist/katex.min.css';

export type ExamPdfQuestion = {
  id: string;
  type: string;
  text?: string;
  formattedText?: string;
  secondStatement?: string;
  subject?: { id: string; name: string };
  options?: Array<{
    id?: string;
    text: string;
    isCorrect?: boolean;
    image?: QuestionOptionImageDisplay;
  }>;
  alternatives?: Array<{
    id?: string;
    text: string;
    isCorrect?: boolean;
    image?: QuestionOptionImageDisplay;
  }>;
  value?: number;
  points?: number;
  solution?: string;
  formattedSolution?: string;
  difficulty?: string;
};

export type ExamPdfSubjectBlock = {
  subject: { id: string; name: string };
  questions: ExamPdfQuestion[];
};

export interface EvaluationExamPdfLayoutProps {
  title: string;
  subjects: ExamPdfSubjectBlock[];
  includeGabarito: boolean;
  gradeName?: string;
  courseName?: string;
}

const PAGE_STYLES: React.CSSProperties = {
  width: '180mm',
  background: '#ffffff',
  color: '#111827',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11pt',
  lineHeight: 1.5,
  WebkitFontSmoothing: 'antialiased',
};

const blockStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '14px 16px',
  marginBottom: '12px',
  background: '#f9fafb',
};

function ExamStatement({ content }: { content: string }) {
  const str = content.trim();
  if (!str) return null;

  if (isLikelyPlainText(str)) {
    return (
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '11pt' }}>
        {cleanLegacyText(str)}
      </div>
    );
  }

  return (
    <div
      style={{ lineHeight: 1.65, fontSize: '11pt' }}
      dangerouslySetInnerHTML={{ __html: getQuestionHtmlForDisplay(str, BASE_URL) }}
    />
  );
}

function ExamOption({
  letter,
  text,
  image,
  questionId,
  isCorrect,
  showGabarito,
}: {
  letter: string;
  text: string;
  image?: QuestionOptionImageDisplay;
  questionId: string;
  isCorrect?: boolean;
  showGabarito: boolean;
}) {
  const imageSrc = getOptionImageDisplaySrc(image, questionId, BASE_URL);
  const { width, height } = getOptionImageDimensions(image);
  const hasText = Boolean(text?.trim());
  const highlighted = showGabarito && isCorrect;

  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        padding: '10px 12px',
        marginBottom: '8px',
        border: highlighted ? '2px solid #16a34a' : '1px solid #e5e7eb',
        borderRadius: '8px',
        background: highlighted ? '#f0fdf4' : '#ffffff',
      }}
    >
      <span style={{ fontWeight: 700, minWidth: '28px', fontSize: '11pt' }}>{letter})</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasText && (
          <div
            style={{ lineHeight: 1.55, fontSize: '11pt' }}
            dangerouslySetInnerHTML={{ __html: renderMathInText(text) }}
          />
        )}
        {imageSrc && (
          <img
            src={imageSrc}
            alt=""
            crossOrigin="anonymous"
            style={{
              display: 'block',
              marginTop: hasText ? '8px' : 0,
              maxWidth: width ? `${Math.min(width, 480)}px` : '100%',
              width: width ? `${Math.min(width, 480)}px` : undefined,
              maxHeight: height ? `${height}px` : undefined,
              height: 'auto',
            }}
          />
        )}
        {highlighted && (
          <div style={{ marginTop: '6px', fontSize: '9pt', color: '#15803d', fontWeight: 600 }}>
            ✓ Resposta correta
          </div>
        )}
      </div>
    </div>
  );
}

function ExamQuestionBlock({
  question,
  index,
  includeGabarito,
}: {
  question: ExamPdfQuestion;
  index: number;
  includeGabarito: boolean;
}) {
  const opts = question.options?.length
    ? question.options
    : question.alternatives ?? [];
  const isMultipleChoice =
    question.type === 'multipleChoice' ||
    question.type === 'multiple_choice' ||
    question.type === 'trueFalse' ||
    question.type === 'true_false';
  const isEssay =
    question.type === 'dissertativa' ||
    question.type === 'open' ||
    question.type === 'essay';
  const points = question.value ?? question.points ?? 0;
  const solution = question.formattedSolution ?? question.solution ?? '';

  return (
    <div
      data-pdf-section={`question-${question.id}`}
      style={{
        ...blockStyle,
        marginBottom: '16px',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '13pt',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        Questão {index + 1}
        {points > 0 && (
          <span style={{ fontWeight: 400, fontSize: '10pt', color: '#6b7280', marginLeft: '8px' }}>
            ({points} {points === 1 ? 'ponto' : 'pontos'})
          </span>
        )}
      </div>

      <ExamStatement content={question.formattedText ?? question.text ?? ''} />
      {question.secondStatement?.trim() && (
        <div style={{ marginTop: '12px' }}>
          <ExamStatement content={question.secondStatement} />
        </div>
      )}

      {isMultipleChoice && opts.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontWeight: 600, marginBottom: '10px', fontSize: '11pt' }}>
            {includeGabarito ? 'Alternativas:' : 'Selecione a alternativa correta:'}
          </div>
          {opts.map((opt, i) => {
            if (!optionHasContent({ text: opt.text, image: opt.image })) return null;
            return (
              <ExamOption
                key={opt.id ?? `opt-${i}`}
                letter={String.fromCharCode(65 + i)}
                text={opt.text}
                image={opt.image}
                questionId={question.id}
                isCorrect={opt.isCorrect}
                showGabarito={includeGabarito}
              />
            );
          })}
        </div>
      )}

      {isEssay && (
        <div
          style={{
            marginTop: '14px',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            padding: '16px',
            minHeight: '100px',
            background: '#ffffff',
          }}
        >
          <div style={{ fontSize: '10pt', color: '#6b7280', marginBottom: '8px' }}>
            Área para resposta do estudante
          </div>
        </div>
      )}

      {includeGabarito && solution.trim() && (
        <div
          style={{
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px', color: '#7c3aed' }}>Resolução</div>
          <ExamStatement content={solution} />
        </div>
      )}
    </div>
  );
}

export function EvaluationExamPdfLayout({
  title,
  subjects,
  includeGabarito,
  gradeName,
  courseName,
}: EvaluationExamPdfLayoutProps) {
  let globalIndex = 0;

  return (
    <div style={PAGE_STYLES}>
      {subjects.map(({ subject, questions }) => {
        if (questions.length === 0) return null;
        return (
          <div key={subject.id}>
            <div
              data-pdf-section={`subject-${subject.id}`}
              style={{
                marginBottom: '14px',
                padding: '12px 14px',
                background: '#7c3aed',
                color: '#ffffff',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13pt',
              }}
            >
              {subject.name}
              <span style={{ fontWeight: 400, fontSize: '10pt', marginLeft: '8px' }}>
                ({questions.length} {questions.length === 1 ? 'questão' : 'questões'})
              </span>
            </div>

            {questions.map((question) => {
              const idx = globalIndex;
              globalIndex += 1;
              return (
                <ExamQuestionBlock
                  key={question.id}
                  question={question}
                  index={idx}
                  includeGabarito={includeGabarito}
                />
              );
            })}
          </div>
        );
      })}

      <div style={{ fontSize: '9pt', color: '#9ca3af', marginTop: '8px' }}>
        {title}
        {courseName ? ` • ${courseName}` : ''}
        {gradeName ? ` • ${gradeName}` : ''}
        {includeGabarito ? ' • Com gabarito' : ''}
      </div>
    </div>
  );
}
