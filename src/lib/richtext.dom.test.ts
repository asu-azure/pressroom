// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeRich } from './richtext';

/**
 * The WRITE path — the actual sanitizing boundary. It needs DOMParser, so it
 * lives in its own jsdom-backed file; the validator tests next door stay in the
 * default node environment.
 *
 * The regression these lock in: `class` used to be kept on <figure> only, so a
 * gradient highlight span survived as a bare <span> and the copy silently lost
 * its styling the first time the author pressed Save.
 */
describe('sanitizeRich — highlight spans', () => {
  it('keeps the highlight classes on a span', () => {
    const out = sanitizeRich('<p>I’m <span class="hl hl--g-blue">Asu Azure</span>.</p>');
    expect(out).toContain('class="hl hl--g-blue"');
  });

  it('survives a save round-trip unchanged', () => {
    const html = '<p>build <span class="hl hl--g-blue">characters</span> and worlds</p>';
    expect(sanitizeRich(sanitizeRich(html))).toBe(sanitizeRich(html));
    expect(sanitizeRich(html)).toContain('hl--g-blue');
  });

  it('keeps every highlight variant the design system defines', () => {
    for (const cls of ['hl--g-blue', 'hl--g-cyan', 'hl--g-amber', 'hl--g-mix', 'hl--v']) {
      expect(sanitizeRich(`<span class="hl ${cls}">x</span>`)).toContain(cls);
    }
  });

  it('still strips classes it does not know', () => {
    const out = sanitizeRich('<span class="hl evil-class">x</span>');
    expect(out).toContain('hl');
    expect(out).not.toContain('evil-class');
  });

  it('does not let a span borrow the figure classes', () => {
    expect(sanitizeRich('<span class="fore-fig--lg">x</span>')).not.toContain('fore-fig');
  });

  it('leaves figures working as before', () => {
    const out = sanitizeRich('<figure class="fore-fig fore-fig--md"><figcaption>cap</figcaption></figure>');
    expect(out).toContain('fore-fig--md');
  });

  it('drops dangerous markup regardless of class', () => {
    const out = sanitizeRich('<span class="hl" onclick="alert(1)">x</span>');
    expect(out).not.toContain('onclick');
  });
});
