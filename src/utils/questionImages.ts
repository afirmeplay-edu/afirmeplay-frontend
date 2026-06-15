import { cleanLegacyText } from './textFormatter';
import { renderMathInHtml } from './renderMath';

/**
 * Resolve URLs relativas de imagens de questões no HTML.
 * A API devolve <img src="/questions/{id}/images/{id}">; em origens diferentes
 * do backend é preciso prefixar com a base da API.
 */
export function resolveQuestionImageSrc(html: string, apiBase: string): string {
  if (!html || typeof html !== 'string') return html
  const base = (apiBase || '').replace(/\/+$/, '')
  return html.replace(
    /src="(\/questions\/[^"]+)"/g,
    (_, path) => `src="${base}${path}"`
  )
}

/**
 * Normaliza HTML de questão para exibição: preserva quebras de linha e melhora
 * formatação quando o conteúdo veio como texto puro ou com estrutura inconsistente.
 * - Converte \n em <br> para que textos com quebras de linha apareçam corretamente.
 */
export function normalizeQuestionHtmlForDisplay(html: string): string {
  if (!html || typeof html !== 'string') return html
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<br>')
}

/**
 * Prepara HTML de questão para exibição: limpa hard-breaks, resolve imagens e normaliza quebras de linha.
 * Use este helper ao renderizar enunciados no Visualizar Questão e na própria avaliação.
 */
export function getQuestionHtmlForDisplay(html: string, apiBase: string): string {
  const cleaned = cleanLegacyText(html || '');
  const withImages = normalizeQuestionHtmlForDisplay(resolveQuestionImageSrc(cleaned, apiBase));
  return renderMathInHtml(withImages);
}

/**
 * Converte URLs absolutas de imagens de questões de volta para relativas.
 * Usado ao enviar o formulário para a API (que espera src="/questions/...").
 */
export function toRelativeQuestionImageSrc(html: string, apiBase: string): string {
  if (!html || typeof html !== 'string') return html
  const base = (apiBase || '').replace(/\/+$/, '')
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(
    new RegExp(`src="${escaped}(/questions/[^"]+)"`, 'g'),
    (_, path) => `src="${path}"`
  )
}
