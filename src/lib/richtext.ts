/**
 * Sanitizer for the foreword rich text. Author-only input (RLS), but the
 * HTML is rendered to every reader — keep the surface tiny anyway.
 */

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN', 'FONT', 'UL', 'OL', 'LI',
  'FIGURE', 'FIGCAPTION', 'IMG',
]);

const ALLOWED_STYLES = new Set(['text-align', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration']);

/** Drag-resized figures carry their own width; every other element may not. */
const FIGURE_STYLES = new Set(['width']);

/** A figure width must be a plain percentage — no calc(), url(), var(), etc. */
const PERCENT = /^\d{1,3}(\.\d+)?%$/;

function isAllowedDeclaration(tagName: string, prop: string, value: string): boolean {
  if (ALLOWED_STYLES.has(prop)) return true;
  return tagName === 'FIGURE' && FIGURE_STYLES.has(prop) && PERCENT.test(value);
}

/** The only classes an author-inserted figure may carry (float + size). */
const ALLOWED_CLASSES = new Set([
  'fore-fig',
  'fore-fig--left', 'fore-fig--right', 'fore-fig--center',
  'fore-fig--sm', 'fore-fig--md', 'fore-fig--lg',
]);

/** Images may only point at our own public storage bucket — nothing external. */
const STORAGE_PREFIX = `${import.meta.env.PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`;

function isAllowedImageSrc(src: string): boolean {
  return STORAGE_PREFIX.length > '/storage/v1/object/public/'.length && src.startsWith(STORAGE_PREFIX);
}

function keepClass(value: string): string {
  return value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c)).join(' ');
}

function cleanNode(node: Element): void {
  for (const child of [...node.children]) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Unwrap unknown tags — keep their (cleaned) children.
      cleanNode(child);
      child.replaceWith(...child.childNodes);
      continue;
    }
    // Drop an image whose source isn't our own storage — no children to keep.
    if (child.tagName === 'IMG' && !isAllowedImageSrc(child.getAttribute('src') ?? '')) {
      child.remove();
      continue;
    }
    // Strip every attribute except a filtered style / font face / figure class /
    // validated image src+alt.
    for (const attr of [...child.attributes]) {
      if (attr.name === 'style') {
        const kept = attr.value
          .split(';')
          .map((d) => d.trim())
          .filter((d) => {
            const [prop, ...rest] = d.split(':');
            return isAllowedDeclaration(
              child.tagName,
              prop?.trim().toLowerCase() ?? '',
              rest.join(':').trim(),
            );
          });
        if (kept.length) child.setAttribute('style', kept.join('; '));
        else child.removeAttribute('style');
      } else if (attr.name === 'face' && child.tagName === 'FONT') {
        // keep
      } else if (attr.name === 'class' && child.tagName === 'FIGURE') {
        const kept = keepClass(attr.value);
        if (kept) child.setAttribute('class', kept);
        else child.removeAttribute('class');
      } else if (child.tagName === 'IMG' && (attr.name === 'src' || attr.name === 'alt')) {
        // keep validated image src / alt
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
  // An untouched caption is a CSS placeholder in the editor, not content —
  // publishing it would render as an unexplained gap under the image.
  for (const cap of [...doc.body.querySelectorAll('figcaption')]) {
    if (!cap.textContent?.trim()) cap.remove();
  }
  return doc.body.innerHTML;
}

/**
 * Server-safe read path.
 *
 * `sanitizeRich` needs DOMParser, which does not exist in the Node SSR runtime —
 * calling it in Astro frontmatter throws. The write path is the real boundary
 * (RichTextEditor runs sanitizeRich before every save, and RLS means the author
 * is the only writer), so what SSR renders is already sanitizer output.
 *
 * This is defense-in-depth on top of that: a dependency-free VALIDATOR rather
 * than a rewriter. Validating conservatively is easy to get right; rewriting
 * HTML with regexes is not. Anything it cannot vouch for degrades to escaped
 * text, so a tampered row loses its formatting instead of executing.
 */
const TAG = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b/g;
/** Case-insensitive: `ONMOUSEOVER=` is every bit as live as `onmouseover=`. */
const EVENT_ATTR = /\son[a-zA-Z]+\s*=/i;
const BAD_URL = /(?:href|src|srcdoc|xlink:href)\s*=\s*["']?\s*(?:javascript|data|vbscript):/i;
const IMG_SRC = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi;

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function isRichSafe(html: string): boolean {
  if (EVENT_ATTR.test(html) || BAD_URL.test(html)) return false;
  for (const m of html.matchAll(TAG)) {
    if (!ALLOWED_TAGS.has(m[1].toUpperCase())) return false;
  }
  for (const m of html.matchAll(IMG_SRC)) {
    if (!isAllowedImageSrc(m[1])) return false;
  }
  return true;
}

/**
 * Render-ready HTML for server-side output. Returns the stored markup when it
 * validates, otherwise its text content escaped into one paragraph so the words
 * survive even when the markup is rejected.
 *
 * The degrade is deliberately blunt: `<…>` runs are dropped wholesale, which
 * also eats prose like "1 < 2 > 0". That is the right trade for a path that
 * only runs on markup we already refused to trust — losing a few characters
 * beats guessing which angle brackets were content.
 */
export function richForServer(html: string): string {
  if (!html.trim()) return '';
  if (isRichSafe(html)) return html;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? `<p>${escapeHtml(text)}</p>` : '';
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
