import katex from 'katex';
import 'katex/dist/katex.min.css';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Converte delimitadores LaTeX em HTML renderizado pelo KaTeX.
 * Suporta inline ($...$) e bloco ($$...$$).
 */
export function renderMathInText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    const latex = (match[1] ?? match[2] ?? '').trim();
    const displayMode = match[1] !== undefined;

    if (latex) {
      try {
        result += katex.renderToString(latex, {
          throwOnError: false,
          displayMode,
        });
      } catch {
        result += escapeHtml(match[0]);
      }
    } else {
      result += escapeHtml(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

const MATH_SKIP_TAGS = new Set(['script', 'style', 'pre', 'code']);

/**
 * Processa delimitadores LaTeX ($...$ / $$...$$) em nós de texto dentro de HTML,
 * preservando tags e atributos (imagens, formatação TipTap, etc.).
 */
export function renderMathInHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text.includes('$')) return;
      const wrapper = document.createElement('span');
      wrapper.innerHTML = renderMathInText(text);
      node.parentNode?.replaceChild(wrapper, node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = (node as Element).tagName.toLowerCase();
    if (MATH_SKIP_TAGS.has(tag)) return;

    Array.from(node.childNodes).forEach(walk);
  };

  Array.from(container.childNodes).forEach(walk);
  return container.innerHTML;
}
