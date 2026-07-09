/**
 * Sanitizer for the foreword rich text. Author-only input (RLS), but the
 * HTML is rendered to every reader — keep the surface tiny anyway.
 */

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN', 'FONT', 'UL', 'OL', 'LI',
]);

const ALLOWED_STYLES = new Set(['text-align', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration']);

function cleanNode(node: Element): void {
  for (const child of [...node.children]) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Unwrap unknown tags — keep their (cleaned) children.
      cleanNode(child);
      child.replaceWith(...child.childNodes);
      continue;
    }
    // Strip every attribute except a filtered style / font face.
    for (const attr of [...child.attributes]) {
      if (attr.name === 'style') {
        const kept = attr.value
          .split(';')
          .map((d) => d.trim())
          .filter((d) => ALLOWED_STYLES.has(d.split(':')[0]?.trim().toLowerCase() ?? ''));
        if (kept.length) child.setAttribute('style', kept.join('; '));
        else child.removeAttribute('style');
      } else if (attr.name === 'face' && child.tagName === 'FONT') {
        // keep
      } else {
        child.removeAttribute(attr.name);
      }
    }
    cleanNode(child);
  }
}

export function sanitizeRich(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/** Legacy plain-text forewords (pre-editor) become paragraphs. */
export function toRichHtml(foreword: string): string {
  if (!foreword.trim()) return '';
  if (foreword.includes('<')) return sanitizeRich(foreword);
  return foreword
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>')}</p>`)
    .join('');
}
