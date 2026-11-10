/** Labels amigáveis para source_badge da logística (só exibição). */

const SOURCE_BADGE_LABELS: Record<string, string> = {
  avaliacao: 'Avaliação do sistema',
  avaliação: 'Avaliação do sistema',
  evaluation: 'Avaliação do sistema',
  sistema: 'Avaliação do sistema',
  'avaliação do sistema': 'Avaliação do sistema',
  'avaliacao do sistema': 'Avaliação do sistema',
  cartao_resposta: 'Cartão-resposta',
  'cartão-resposta': 'Cartão-resposta',
  'cartao-resposta': 'Cartão-resposta',
  'cartão resposta': 'Cartão-resposta',
  'cartao resposta': 'Cartão-resposta',
  answer_sheet: 'Cartão-resposta',
  personalizada: 'Personalizada',
  custom: 'Personalizada',
  manual: 'Personalizada',
};

export function labelLogisticsSourceBadge(
  sourceBadge: string | null | undefined
): string | null {
  if (!sourceBadge || !String(sourceBadge).trim()) return null;
  const raw = String(sourceBadge).trim();
  const key = raw.toLowerCase();
  return SOURCE_BADGE_LABELS[key] ?? raw;
}
