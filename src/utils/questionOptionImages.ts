import type {
  QuestionOptionApi,
  QuestionOptionFormValue,
  QuestionOptionImageApi,
  QuestionOptionImageDisplay,
  QuestionOptionImageForm,
} from '@/types/question-option';

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function mapOptionFromApi(
  option: QuestionOptionApi,
  questionId?: string
): QuestionOptionFormValue {
  let image: QuestionOptionImageForm | undefined;

  if (option.image) {
    if (typeof option.image === 'string') {
      image = { kind: 'new', dataUrl: option.image };
    } else if (option.image.data) {
      image = {
        kind: 'new',
        dataUrl: option.image.data,
        width: option.image.width,
        height: option.image.height,
      };
    } else if (option.image.id) {
      const imageUrl =
        option.image.imageUrl ??
        (questionId ? `/questions/${questionId}/images/${option.image.id}` : '');
      image = {
        kind: 'existing',
        id: option.image.id,
        imageUrl,
        width: option.image.width,
        height: option.image.height,
      };
    }
  }

  return {
    id: option.id,
    text: option.text ?? '',
    isCorrect: Boolean(option.isCorrect),
    image,
  };
}

export function mapOptionToApiPayload(
  option: QuestionOptionFormValue,
  index: number
): QuestionOptionApi {
  const payload: QuestionOptionApi = {
    id: option.id ?? String.fromCharCode(65 + index),
    text: option.text ?? '',
    isCorrect: option.isCorrect,
  };

  if (option.image?.kind === 'new' && option.image.dataUrl) {
    payload.image = { data: option.image.dataUrl };
  } else if (option.image?.kind === 'existing' && option.image.id) {
    payload.image = { id: option.image.id };
  }

  return payload;
}

function isFormImage(
  image: QuestionOptionImageDisplay
): image is QuestionOptionImageForm {
  return Boolean(image && typeof image === 'object' && 'kind' in image);
}

function isApiImage(
  image: QuestionOptionImageDisplay
): image is QuestionOptionImageApi {
  return Boolean(image && typeof image === 'object' && !('kind' in image));
}

/** URL para exibir imagem da alternativa (API, preview local ou data URL). */
export function getOptionImageDisplaySrc(
  image: QuestionOptionImageDisplay,
  questionId: string | undefined,
  apiBase: string
): string | null {
  if (!image) return null;

  if (isFormImage(image)) {
    if (image.kind === 'new') return image.dataUrl;
    const base = (apiBase || '').replace(/\/+$/, '');
    if (image.imageUrl.startsWith('data:')) return image.imageUrl;
    if (image.imageUrl.startsWith('http')) return image.imageUrl;
    return `${base}${image.imageUrl.startsWith('/') ? '' : '/'}${image.imageUrl}`;
  }

  if (typeof image === 'string') {
    if (image.startsWith('data:') || image.startsWith('http')) return image;
    const base = (apiBase || '').replace(/\/+$/, '');
    return `${base}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  if (isApiImage(image)) {
    if (image.data) return image.data;
    const base = (apiBase || '').replace(/\/+$/, '');
    if (image.imageUrl) {
      if (image.imageUrl.startsWith('http') || image.imageUrl.startsWith('data:')) {
        return image.imageUrl;
      }
      return `${base}${image.imageUrl}`;
    }
    if (image.id && questionId) {
      return `${base}/questions/${questionId}/images/${image.id}`;
    }
  }

  return null;
}

export function getOptionImageDimensions(
  image: QuestionOptionImageDisplay
): { width?: number; height?: number } {
  if (!image || typeof image !== 'object') return {};
  if ('width' in image || 'height' in image) {
    return { width: image.width, height: image.height };
  }
  return {};
}

export function optionHasContent(option: {
  text?: string;
  image?: QuestionOptionImageDisplay;
}): boolean {
  return Boolean(option.text?.trim() || option.image);
}

/** Ignora alternativas vazias no final da lista (slots não utilizados). */
export function getActiveQuestionOptions<T extends { text?: string; image?: QuestionOptionImageDisplay }>(
  options: T[] | undefined
): T[] {
  if (!options?.length) return [];
  const lastWithContent = options.reduce(
    (last, opt, idx) => (optionHasContent(opt) ? idx : last),
    -1
  );
  return lastWithContent >= 0 ? options.slice(0, lastWithContent + 1) : options;
}

/** Mapeia opções de uma Question (store/avaliação) para o payload da API. */
export function mapEvaluationQuestionOptions(
  options: Array<{
    id?: string;
    text: string;
    isCorrect: boolean;
    image?: QuestionOptionImageApi | string;
  }> | undefined
): QuestionOptionApi[] {
  if (!options?.length) return [];
  return options.map((opt, index) => {
    const payload: QuestionOptionApi = {
      id: opt.id ?? String.fromCharCode(65 + index),
      text: opt.text ?? '',
      isCorrect: Boolean(opt.isCorrect),
    };
    if (opt.image) {
      if (typeof opt.image === 'string') {
        payload.image = { data: opt.image };
      } else if (opt.image.data) {
        payload.image = {
          data: opt.image.data,
          width: opt.image.width,
          height: opt.image.height,
        };
      } else if (opt.image.id) {
        payload.image = {
          id: opt.image.id,
          width: opt.image.width,
          height: opt.image.height,
        };
      }
    }
    return payload;
  });
}
