import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Render admin-maintained rich text as safe HTML.
 * Existing raw HTML remains supported and is sanitized before display.
 */
export function renderMarkdownContent(content?: string | null): string | null {
  if (!content?.trim()) {
    return null;
  }

  const renderedHtml = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  const sanitizedHtml = DOMPurify.sanitize(renderedHtml, {
    USE_PROFILES: { html: true },
  }).trim();

  return sanitizedHtml || null;
}
