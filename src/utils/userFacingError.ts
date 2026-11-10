import { UI_MSG } from '@/constants/uiMessages';

type FieldInfo = { label: string; gender: 'm' | 'f'; plural?: boolean };

/** Mapa de nomes de campo da API → rótulo amigável (só para exibição). */
const FIELD_LABELS: Record<string, FieldInfo> = {
  test_id: { label: 'Avaliação', gender: 'f' },
  class_id: { label: 'Turma', gender: 'f' },
  start_date: { label: 'data de início', gender: 'f' },
  end_date: { label: 'data de término', gender: 'f' },
  title: { label: 'título', gender: 'm' },
  source: { label: 'origem', gender: 'f' },
  status: { label: 'situação', gender: 'f' },
  evaluation_mode: { label: 'formato da avaliação', gender: 'm' },
  education_stage_id: { label: 'etapa de ensino', gender: 'f' },
  num_questions: { label: 'número de questões', gender: 'm' },
  correct_answers: { label: 'gabarito', gender: 'm' },
  pdf_mode: { label: 'formato do PDF', gender: 'm' },
  question_skills: { label: 'habilidades das questões', gender: 'f', plural: true },
  store_item_id: { label: 'item', gender: 'm' },
  min_grade: { label: 'nota mínima', gender: 'f' },
  scope_filter: { label: 'turmas', gender: 'f', plural: true },
  requirement: { label: 'requisito', gender: 'm' },
  name: { label: 'nome', gender: 'm' },
  price: { label: 'preço', gender: 'm' },
  category: { label: 'categoria', gender: 'f' },
};

const KNOWN_FIELD_KEYS = Object.keys(FIELD_LABELS).sort((a, b) => b.length - a.length);

const ENGLISH_KNOWN: Record<string, string> = {
  'amount must be positive': 'O valor deve ser maior que zero.',
  'insufficient balance': 'Saldo insuficiente.',
};

const TECHNICAL_AFTER_MAP: RegExp[] = [
  /request failed with status code/i,
  /status code\s*\d{3}/i,
  /\bjob[_-]?id\b/i,
  /\bstack\b/i,
  /\btimeout\b/i,
  /\bnetwork error\b/i,
  /\beconnrefused\b/i,
  /\benotfound\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bNaN\b/,
  /\baxios\b/i,
  /\bpayload\b/i,
  /\bendpoint\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bschema\b/i,
  /\bmigration\b/i,
  /\buuid\b/i,
  /\bserver\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /at\s+\S+\s*\(/,
  /[a-z]+_[a-z0-9_]+/i, // snake_case restante após o mapeamento
  /[{}\[\]]/,
  /^\s*Error:/i,
];

const PT_HINT =
  /\b(não|nao|obrigat|inválid|invalid|selecione|encontrad|permiss|turma|escola|municíp|municip|dados|erro|tente|poss[ií]vel|usu[aá]rio|aluno|avalia|gabarito|cronograma|saldo|moeda|item|filtro|s[eé]rie|deve|lista|ser|uma|umas|para|com|dos|das|pelo|pela|antes|publicar|precisa|precisam|todas|todos|origem|alterad|personalizad|t[ií]tulo|quantidade|formato|ano|bloco|m[aá]ximo|quest|lote|imagens|dispon|requerid|conquista|medal|escopo|informe|menos|leciona|professor|diretor|coordenador|banco|integridade|autenticado|fornecidos|estudante|contexto|subdom[ií]nio|cidade|indicador|cart[aã]o|resposta|gera[cç][aã]o|cadastre|especial|adap|par[aâ]metro|obrigat[oó]ri)\b/i;

const FIELD_TOKEN_RE = new RegExp(
  `(?:\\b\\w+\\[\\d+\\]\\.)?(${KNOWN_FIELD_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function agreeAdjective(gender: 'm' | 'f', plural: boolean | undefined, base: 'obrigatório' | 'inválido'): string {
  if (base === 'obrigatório') {
    if (plural) return gender === 'f' ? 'obrigatórias' : 'obrigatórios';
    return gender === 'f' ? 'obrigatória' : 'obrigatório';
  }
  if (plural) return gender === 'f' ? 'inválidas' : 'inválidos';
  return gender === 'f' ? 'inválida' : 'inválido';
}

/** Reescreve frases conhecidas e substitui tokens de campo por labels amigáveis. */
export function humanizeApiFieldMessage(raw: string): string {
  let m = raw.trim();
  if (!m) return m;

  // Casos explícitos pedidos na auditoria / produto
  if (/^test_id\s+é\s+obrigat[oó]rio\.?$/i.test(m)) {
    return 'Avaliação é obrigatória.';
  }
  if (/^(?:items\[\d+\]\.)?class_id\s+inv[aá]lido\.?$/i.test(m)) {
    return 'Turma inválida.';
  }
  if (/^evaluation_mode\s+deve\s+ser\b/i.test(m)) {
    return 'Formato da avaliação inválido.';
  }
  if (/^Data\s+inv[aá]lida\s+em\s+start_date\b/i.test(m)) {
    return 'Data de início inválida.';
  }
  if (/^Data\s+inv[aá]lida\s+em\s+end_date\b/i.test(m)) {
    return 'Data de término inválida.';
  }
  if (/^requirement\s+deve\s+ser\s+um\s+objeto\s+JSON\b/i.test(m)) {
    return 'Requisito em formato inválido.';
  }
  if (/^store_item_id\s+é\s+obrigat[oó]rio\.?$/i.test(m)) {
    return 'Item é obrigatório.';
  }
  if (/^num_questions\s+deve\s+ser\s+maior\s+que\s+0\.?$/i.test(m)) {
    return 'Número de questões deve ser maior que 0.';
  }
  if (/^correct_answers\s+é\s+obrigat[oó]rio\.?$/i.test(m)) {
    return 'Gabarito é obrigatório.';
  }
  if (/^pdf_mode\s+inv[aá]lido\b/i.test(m)) {
    return 'Formato do PDF inválido.';
  }
  if (/^education_stage_id\s+inv[aá]lido\.?$/i.test(m)) {
    return 'Etapa de ensino inválida.';
  }
  if (/^min_grade\s+deve\s+estar\s+entre\b/i.test(m)) {
    return 'Nota mínima deve estar entre 0 e 10.';
  }
  if (/^Informe\s+ao\s+menos\s+uma\s+turma\s+em\s+scope_filter\.?$/i.test(m)) {
    return 'Informe ao menos uma turma.';
  }
  if (/^question_skills\s+deve\s+ser\b/i.test(m)) {
    return 'Habilidades das questões em formato inválido.';
  }

  // Padrão: "<campo> é obrigatório[ resto opcional]"
  m = m.replace(
    /^(?:[\w[\].]+\.)?([a-z][a-z0-9_]*)\s+é\s+obrigat[oó]ri[oa]s?(.*)$/i,
    (_full, field: string, rest: string) => {
      const info = FIELD_LABELS[String(field).toLowerCase()];
      if (!info) return _full;
      const adj = agreeAdjective(info.gender, info.plural, 'obrigatório');
      const complement = (rest ?? '').replace(/\s+$/, '').replace(/^\s+/, ' ').replace(/\.$/, '');
      return `${capitalizeFirst(info.label)} é ${adj}${complement}.`;
    }
  );

  // Padrão: "<campo> inválido."
  m = m.replace(
    /^(?:[\w[\].]+\.)?([a-z][a-z0-9_]*)\s+inv[aá]lid([oa]s?)(\.)?$/i,
    (_full, field: string, _suf: string, dot?: string) => {
      const info = FIELD_LABELS[String(field).toLowerCase()];
      if (!info) return _full;
      const adj = agreeAdjective(info.gender, info.plural, 'inválido');
      return `${capitalizeFirst(info.label)} ${adj}${dot ?? '.'}`;
    }
  );

  // Substitui tokens restantes (ex.: items[0].class_id → Turma)
  m = m.replace(FIELD_TOKEN_RE, (full, field: string) => {
    const info = FIELD_LABELS[String(field).toLowerCase()];
    return info ? info.label : full;
  });

  // Remove prefixo técnico residual "items[N]." se ainda houver
  m = m.replace(/\bitems\[\d+\]\./gi, '');

  // AAAA-MM-DD em mensagens de data já humanizadas: limpar restante
  m = m.replace(/\s*\(use\s+AAAA-MM-DD\)\.?/gi, '.').replace(/\.\.+/g, '.');

  return m.trim();
}

function looksEntirelyEnglish(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(m)) return false;
  if (PT_HINT.test(m)) return false;
  if (!/^[\x20-\x7E]+$/.test(m) || !/[A-Za-z]{3,}/.test(m)) return false;
  const words = m.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const engStops = new Set([
    'the', 'a', 'an', 'is', 'are', 'must', 'be', 'to', 'of', 'and', 'or', 'for', 'not',
    'found', 'positive', 'amount', 'balance', 'insufficient', 'context', 'city', 'error',
    'invalid', 'required', 'request', 'failed', 'status', 'code', 'server', 'network',
  ]);
  const engHits = words.filter((w) => engStops.has(w)).length;
  // Exige indício claro de inglês (evita “Todas as turmas precisam…” sem acento)
  return engHits >= 2 || (words.length <= 5 && engHits >= 1);
}

/** Extrai a melhor mensagem candidata do erro Axios/API. */
export function extractRawApiErrorMessage(error: unknown): string | undefined {
  const maybe = error as {
    message?: string;
    response?: {
      data?: {
        error?: string;
        erro?: string;
        mensagem?: string;
        message?: string;
        details?: string | string[];
        hint?: string;
        note?: string;
        detalhes?: string;
      };
    };
  };

  const data = maybe?.response?.data;
  if (!data) {
    return typeof maybe?.message === 'string' && maybe.message.trim() ? maybe.message.trim() : undefined;
  }

  const details =
    typeof data.details === 'string'
      ? data.details
      : Array.isArray(data.details)
        ? data.details.filter((d) => typeof d === 'string').join(', ')
        : undefined;

  const candidates = [
    data.error,
    data.erro,
    data.mensagem,
    data.message,
    details,
    data.hint,
    data.note,
    data.detalhes,
    maybe?.message,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Após humanização: ainda parece técnico?
 * (snake_case residual, status code, stack, etc.)
 */
export function looksTechnicalErrorMessage(message: string | null | undefined): boolean {
  if (!message || !message.trim()) return true;
  const m = message.trim();
  if (m.length > 280) return true;
  if (looksEntirelyEnglish(m)) return true;
  return TECHNICAL_AFTER_MAP.some((re) => re.test(m));
}

/**
 * Retorna mensagem segura para toast/UI.
 * 1) Mapeia campos técnicos → labels amigáveis
 * 2) Traduz inglês conhecido
 * 3) Se ainda técnico / inglês desconhecido → fallback
 */
export function toUserFacingErrorMessage(
  errorOrMessage: unknown,
  fallback: string = UI_MSG.GENERIC_ACTION_FAILED
): string {
  const raw =
    typeof errorOrMessage === 'string'
      ? errorOrMessage.trim()
      : extractRawApiErrorMessage(errorOrMessage);

  if (!raw) return fallback;

  const englishKey = raw.toLowerCase().replace(/\.$/, '').trim();
  if (ENGLISH_KNOWN[englishKey]) return ENGLISH_KNOWN[englishKey];
  if (englishKey === 'city context not found') return fallback;

  const humanized = humanizeApiFieldMessage(raw);
  if (!humanized || looksTechnicalErrorMessage(humanized)) return fallback;
  return humanized;
}
