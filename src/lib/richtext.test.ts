import { describe, expect, it } from 'vitest';
import { isRichSafe, richForServer } from './richtext';

/**
 * The server read path has no DOM, so it validates instead of rewriting.
 * These lock in "conservative": anything it cannot vouch for must be rejected.
 */
describe('isRichSafe', () => {
  const ok = (html: string) => expect(isRichSafe(html)).toBe(true);
  const bad = (html: string) => expect(isRichSafe(html)).toBe(false);

  it('accepts what the editor produces', () => {
    ok('<p>Hello <strong>world</strong>.</p>');
    ok('<h2>Heading</h2><ul><li>one</li><li>two</li></ul>');
    ok('<p style="text-align: center">centred</p>');
    ok('<figure class="fore-fig fore-fig--md"><figcaption>cap</figcaption></figure>');
  });

  it('rejects tags outside the allowlist', () => {
    bad('<script>alert(1)</script>');
    bad('<p>ok</p><iframe src="https://evil.test"></iframe>');
    bad('<object data="x"></object>');
    bad('<svg onload="alert(1)"></svg>');
  });

  it('rejects inline event handlers', () => {
    bad('<p onclick="alert(1)">x</p>');
    bad('<b ONMOUSEOVER="x">y</b>');
  });

  it('rejects dangerous URL schemes', () => {
    bad('<p><span>x</span></p><img src="javascript:alert(1)">');
    bad('<img src=\'data:text/html,<script>alert(1)</script>\'>');
  });

  it('rejects images from anywhere but our own storage', () => {
    bad('<img src="https://evil.test/a.png">');
  });

  it('closing tags are checked too', () => {
    bad('<p>x</p></script>');
  });
});

describe('richForServer', () => {
  it('passes valid markup through untouched', () => {
    const html = '<p>Hello <em>there</em>.</p>';
    expect(richForServer(html)).toBe(html);
  });

  it('degrades rejected markup to escaped text, keeping the words', () => {
    const out = richForServer('<p onclick="x">Keep <b>these</b> words</p>');
    expect(out).toBe('<p>Keep these words</p>');
    expect(out).not.toContain('onclick');
  });

  it('escapes what survives the degrade', () => {
    const out = richForServer('<script>a && b</script>');
    expect(out).toBe('<p>a &amp;&amp; b</p>');
    expect(out).not.toContain('<script');
  });

  it('degrading is blunt about angle brackets in prose — documented trade', () => {
    // "< 2 && 3 >" looks like a tag to the stripper and goes with it. Acceptable:
    // this path only runs on markup already judged untrustworthy.
    expect(richForServer('<script>1 < 2 && 3 > 2</script>')).toBe('<p>1 2</p>');
  });

  it('empty in, empty out', () => {
    expect(richForServer('')).toBe('');
    expect(richForServer('   ')).toBe('');
  });
});
