import { describe, expect, it } from 'vitest';
import { renderMarkdownContent } from './markdown.util';

describe('renderMarkdownContent', () => {
  it('renders markdown headings, lists and emphasis', () => {
    const rendered = renderMarkdownContent('# Titel\n\n- Eins\n- **Zwei**');

    expect(rendered).toContain('<h1>Titel</h1>');
    expect(rendered).toContain('<li>Eins</li>');
    expect(rendered).toContain('<strong>Zwei</strong>');
  });

  it('keeps legacy html content while sanitizing it', () => {
    const rendered = renderMarkdownContent('<h2>Alt</h2><script>alert(1)</script><p>Text</p>');

    expect(rendered).toContain('<h2>Alt</h2>');
    expect(rendered).toContain('<p>Text</p>');
    expect(rendered).not.toContain('<script>');
    expect(rendered).not.toContain('alert(1)');
  });

  it('returns null for empty input', () => {
    expect(renderMarkdownContent('   ')).toBeNull();
    expect(renderMarkdownContent(null)).toBeNull();
  });
});
