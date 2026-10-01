/**
 * Render-time tidy of a work's foreword (the overview's あらすじ). Runs on the
 * output of `toRichHtml()` in the browser — the stored HTML is never changed.
 *
 * Authors paste the synopsis from other editors, and the paste brings things
 * the page then shows faithfully:
 * - inline `font-family: "Noto Serif JP"` — the site's SUBSET webfont, which
 *   has none of the author's kanji (see CLAUDE.md, Languages), so whole
 *   paragraphs fell through per glyph to a generic serif;
 * - empty paragraphs, each drawn as a blank ruled line;
 * - an <h1> repeating the book's title right under the page's own <h1>;
 * - section heads as bold run-ins ("1. 出会い 本文…") rather than headings, so
 *   there was nothing to build a section nav from.
 *
 * Needs DOMParser — the overview is a client:only island. Tested in
 * foreword.dom.test.ts.
 */

export interface ForewordSection {
  id: string;
  text: string;
}

const SUBSET_FAMILIES = new Set(['noto serif jp', 'noto sans jp']);
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);
const HEADINGS = ['H1', 'H2', 'H3', 'H4'];
/** A run-in section head: "1. …", "3 . …", "２．…" — short, numbered. */
const RUN_IN = /^\s*[0-9０-９]{1,2}\s*[.．、]\s*\S/;
const BLANK = /[\s ​-‍﻿]/g;

const isBlank = (s: string | null | undefined) => !(s ?? '').replace(BLANK, '');

/** Compare titles loosely: width, spacing and punctuation don't matter. */
export function normTitle(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/** True when a font-family value names one of the subset webfonts. */
function namesSubsetFont(value: string): boolean {
  return value
    .split(',')
    .some((f) => SUBSET_FAMILIES.has(f.trim().replace(/^['"]|['"]$/g, '').toLowerCase()));
}

function dropSubsetFonts(root: HTMLElement): void {
  for (const el of [...root.querySelectorAll<HTMLElement>('[style]')]) {
    const kept = (el.getAttribute('style') ?? '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => {
        if (!d) return false;
        const [prop, ...rest] = d.split(':');
        return !(prop.trim().toLowerCase() === 'font-family' && namesSubsetFont(rest.join(':')));
      });
    if (kept.length) el.setAttribute('style', kept.join('; '));
    else el.removeAttribute('style');
  }
  for (const font of [...root.querySelectorAll('font[face]')]) {
    if (namesSubsetFont(font.getAttribute('face') ?? '')) font.removeAttribute('face');
    if (!font.attributes.length) font.replaceWith(...font.childNodes);
  }
}

function hasMedia(el: Element): boolean {
  return Boolean(el.querySelector('img, figure')) || el.tagName === 'IMG' || el.tagName === 'FIGURE';
}

function rename(el: Element, tag: string): Element {
  const next = el.ownerDocument.createElement(tag);
  for (const a of [...el.attributes]) next.setAttribute(a.name, a.value);
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}

function isBold(el: Element): boolean {
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true;
  const w = (el as HTMLElement).style?.fontWeight ?? '';
  return w === 'bold' || w === 'bolder' || Number(w) >= 600;
}

/** Nearest block ancestor (P/DIV/BLOCKQUOTE) inside root, or null. */
function blockOf(el: Element, root: Element): Element | null {
  for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
    if (n.tagName === 'P' || n.tagName === 'DIV' || n.tagName === 'BLOCKQUOTE') return n;
  }
  return null;
}

/** No visible text in `block` comes before `el`. */
function leadsBlock(el: Element, block: Element): boolean {
  const walker = block.ownerDocument.createTreeWalker(block, 4 /* SHOW_TEXT */);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (el.contains(t)) return true;
    if (!isBlank(t.textContent)) return false;
  }
  return false;
}

/** Bold run-ins that open a block and look like "N. title" become <h2>. */
function promoteRunIns(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const el of [...root.querySelectorAll('b, strong, span')]) {
    if (!el.isConnected || !isBold(el)) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!RUN_IN.test(text) || text.length > 60) continue;
    // an outer bold span already promoted with this one inside it
    if (el.closest('h1, h2, h3, h4')) continue;
    const block = blockOf(el, root);
    if (!block || !leadsBlock(el, block)) continue;
    const h = doc.createElement('h2');
    h.textContent = text.replace(/^([0-9０-９]{1,2})\s*([.．、])\s*/, '$1$2 ');
    block.before(h);
    el.remove();
  }
}

function dropEmptyBlocks(root: HTMLElement): void {
  // deepest first, so a wrapper emptied by its children goes too
  for (const el of [...root.querySelectorAll('*')].reverse()) {
    if (!BLOCKS.has(el.tagName)) continue;
    if (isBlank(el.textContent) && !hasMedia(el)) el.remove();
  }
}

export function tidyForeword(html: string, title: string): { html: string; sections: ForewordSection[] } {
  if (!html.trim()) return { html: '', sections: [] };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;

  dropSubsetFonts(root);

  // A leading h1 that only repeats the book's title — the page already has one.
  const want = normTitle(title);
  const first = root.querySelector('h1');
  if (first && want.length >= 4) {
    const got = normTitle(first.textContent ?? '');
    if (leadsBlock(first, root) && got.length >= 4 && (got.includes(want) || want.includes(got))) {
      if (hasMedia(first)) rename(first, 'div');
      else first.remove();
    }
  }

  // Headings with no words (an image pasted into one) are just blocks.
  for (const h of [...root.querySelectorAll(HEADINGS.join(','))]) {
    if (isBlank(h.textContent)) rename(h, 'div');
  }

  // The page owns the only <h1>: if the foreword still has one, everything moves down a level.
  if (root.querySelector('h1')) {
    for (const tag of ['H3', 'H2', 'H1']) {
      for (const h of [...root.querySelectorAll(tag)]) rename(h, `h${Number(tag[1]) + 1}`);
    }
  }

  promoteRunIns(root);
  dropEmptyBlocks(root);

  const sections: ForewordSection[] = [];
  for (const h of root.querySelectorAll('h2')) {
    const text = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const id = `ov-s-${sections.length + 1}`;
    h.id = id;
    sections.push({ id, text });
  }
  return { html: root.innerHTML, sections };
}
