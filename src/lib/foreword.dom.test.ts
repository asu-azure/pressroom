// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { normTitle, tidyForeword } from './foreword';

const TITLE = '扉の向こうはヒマワリ畑：夜光虫編';
const IMG = '<img src="https://x.supabase.co/storage/v1/object/public/pages/a.webp" alt="">';

// shaped like the real 夜光虫編 foreword (pasted from another editor)
const PASTED = `<p></p><div style="text-align: center"><h1>『扉の向こうはヒマワリ畑：夜光虫編』（漫画版）詳細ストーリー</h1>
<h1 style="text-align: center; font-size: 17px"><span style="font-family: &quot;Noto Serif JP&quot;, serif">${IMG}</span></h1>
<div><figure class="fore-fig fore-fig--center"><div style="text-align: left"><span style="font-family: &quot;Noto Serif JP&quot;, serif"><span style="font-size: 17px; font-weight: bold">1. 完璧な優等生と不良ぶる少年の出会い</span><span> 物語の主人公であるタイムは、</span></span></div></figure></div></div>
<p style="font-size: 17px"><span style="font-family: &quot;Noto Serif JP&quot;, serif"><br></span></p>
<p style="font-size: 17px; text-align: start"><span style="font-family: &quot;Noto Serif JP&quot;, serif"><span style="font-weight: 700">2. 愛を試すための狂気じみた「合理的な計画」</span> 愛情を失うことを極度に恐れる</span></p>
<div>&nbsp;</div><div><b>&#8203;</b></div>
<p><b>3 . 計画の失敗と夜光虫の嘘</b> しかし、その過激な愛の証明は</p>
<p>本文の途中に <b>4. 太字</b> があっても見出しにはしない。</p>`;

const tidy = (html: string, title = TITLE) => tidyForeword(html, title);
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html').body;

describe('tidyForeword', () => {
  it('drops the subset webfont, keeps every other family', () => {
    const { html } = tidy(
      '<p><span style="font-family: &quot;Noto Serif JP&quot;, serif; font-size: 17px">あ</span>' +
        '<span style="font-family: \'Noto Sans CJK JP\'">い</span><font face="Noto Sans JP">う</font><font face="Georgia">え</font></p>',
    );
    const body = dom(html);
    expect(html).not.toMatch(/Noto (Serif|Sans) JP(?! CJK)/);
    expect(body.querySelector('span')!.getAttribute('style')).toBe('font-size: 17px');
    expect(html).toContain('Noto Sans CJK JP'); // the system family is a safe stack
    expect(body.querySelectorAll('font')).toHaveLength(1); // the emptied one unwrapped
    expect(body.textContent).toBe('あいうえ');
  });

  it('removes the leading h1 that repeats the title, and demotes nothing else into h1', () => {
    const { html } = tidy(PASTED);
    const body = dom(html);
    expect(body.querySelector('h1')).toBeNull();
    expect(body.textContent).not.toContain('詳細ストーリー');
    expect(body.querySelector('img')).not.toBeNull(); // the image heading became a block
  });

  it('matches the title across width, spacing and punctuation', () => {
    expect(normTitle('扉の向こうはヒマワリ畑： 雨上がりの空編')).toBe(normTitle('扉の向こうはヒマワリ畑:雨上がりの空編'));
    const { html } = tidy('<h1>扉の向こうはヒマワリ畑 雨上がりの空編</h1><p>本文</p>', '扉の向こうはヒマワリ畑： 雨上がりの空編');
    expect(dom(html).querySelector('h1')).toBeNull();
  });

  it('keeps an h1 that is not the title, moved down a level with the rest', () => {
    const { html } = tidy('<p>前書き</p><h1>第一部</h1><h2>小見出し</h2><p>本文</p>');
    const body = dom(html);
    expect(body.querySelector('h1')).toBeNull();
    expect(body.querySelector('h2')!.textContent).toBe('第一部');
    expect(body.querySelector('h3')!.textContent).toBe('小見出し');
  });

  it('turns numbered bold run-ins that open a block into sections', () => {
    const { html, sections } = tidy(PASTED);
    expect(sections.map((s) => s.text)).toEqual([
      '1. 完璧な優等生と不良ぶる少年の出会い',
      '2. 愛を試すための狂気じみた「合理的な計画」',
      '3. 計画の失敗と夜光虫の嘘',
    ]);
    const body = dom(html);
    expect(sections.map((s) => body.querySelector(`#${s.id}`)!.tagName)).toEqual(['H2', 'H2', 'H2']);
    // the run-in left the paragraph; the body text stays
    expect(body.textContent).toContain('物語の主人公であるタイムは、');
    expect(body.textContent).toContain('しかし、その過激な愛の証明は');
    // bold inside running text is not a heading
    expect(body.textContent).toContain('4. 太字');
  });

  it('removes empty blocks but keeps figures and images', () => {
    const { html } = tidy(`<p></p><div>&nbsp;</div><p><br></p><div><b>​</b></div><figure class="fore-fig">${IMG}</figure><p>本文</p>`);
    const body = dom(html);
    expect([...body.children].map((e) => e.tagName)).toEqual(['FIGURE', 'P']);
  });

  it('is idempotent and safe on empty input', () => {
    const once = tidy(PASTED);
    expect(tidy(once.html)).toEqual(once);
    expect(tidy('')).toEqual({ html: '', sections: [] });
  });
});
