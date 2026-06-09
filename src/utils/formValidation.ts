function highlightElement(element: Element) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  element.classList.add('field-error-highlight');
  setTimeout(() => {
    element.classList.remove('field-error-highlight');
  }, 2000);
}

export function scrollToFirstError(errors: Record<string, unknown>) {
  const firstErrorField = Object.keys(errors)[0];
  if (!firstErrorField) return;

  const element =
    document.querySelector(`[name="${firstErrorField}"]`) ||
    document.getElementById(firstErrorField);

  if (element) {
    highlightElement(element);
  }
}

/** Rola até o primeiro erro, incluindo alternativas aninhadas (options.N.text). */
export function scrollToFirstFormError(errors: Record<string, unknown>) {
  if (errors.options) {
    const optionsErrors = errors.options as Record<string, unknown> | unknown[];
    if (Array.isArray(optionsErrors)) {
      for (let i = 0; i < optionsErrors.length; i++) {
        const optionError = optionsErrors[i] as { text?: { message?: string } } | undefined;
        if (optionError?.text) {
          const input = document.querySelector(`[name="options.${i}.text"]`);
          if (input) {
            highlightElement(input);
            return;
          }
        }
      }
    }

    const optionsSection = document.getElementById('question-form-options');
    if (optionsSection) {
      highlightElement(optionsSection);
      return;
    }
  }

  scrollToFirstError(errors);
}

export function getFirstFormErrorMessage(
  errors: Record<string, unknown>,
  getLabel: (field: string) => string = getFieldLabel
): string {
  const optionsError = errors.options as { message?: string } | unknown[] | undefined;

  if (optionsError && !Array.isArray(optionsError) && optionsError.message) {
    return optionsError.message;
  }

  if (Array.isArray(optionsError)) {
    for (let i = 0; i < optionsError.length; i++) {
      const optionError = optionsError[i] as { text?: { message?: string } } | undefined;
      const message = optionError?.text?.message;
      if (message) {
        return `Alternativa ${String.fromCharCode(65 + i)}: ${message}`;
      }
    }
  }

  const firstErrorField = Object.keys(errors)[0];
  if (!firstErrorField) {
    return 'Verifique os campos obrigatórios do formulário.';
  }

  const fieldError = errors[firstErrorField] as { message?: string } | undefined;
  if (fieldError?.message) {
    return `Por favor, preencha o campo "${getLabel(firstErrorField)}".`;
  }

  return 'Verifique os campos obrigatórios do formulário.';
}

export function getFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    title: 'Título',
    description: 'Descrição',
    type: 'Tipo de Avaliação',
    model: 'Modelo',
    course: 'Curso',
    grade: 'Série',
    state: 'Estado',
    municipality: 'Município',
    selectedSchools: 'Escolas',
    subjects: 'Disciplinas',
    selectedClasses: 'Turmas',
    duration: 'Duração',
    educationStageId: 'Curso',
    subjectId: 'Disciplina',
    difficulty: 'Dificuldade',
    value: 'Valor da Questão',
    text: 'Enunciado',
    secondStatement: 'Segundo Enunciado',
    solution: 'Resolução',
    skills: 'Habilidades',
    questionType: 'Tipo de Questão',
    options: 'Alternativas',
    // Adicionar outros campos conforme necessário
  };
  return labels[fieldName] || fieldName;
}
