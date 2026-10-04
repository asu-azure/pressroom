import { describe, expect, it } from 'vitest';
import { lockReturn, lockedOverview, pageByNumber, readerSearch, sectionParam, withoutParam } from './readerLink';

const pages = ['a', 'b', 'c'].map((id) => ({ id }));

describe('pageByNumber', () => {
  it('finds the n-th page, 1-based', () => {
    expect(pageByNumber('1', pages)).toBe('a');
    expect(pageByNumber(3, pages)).toBe('c');
  });

  it('ignores anything that is not a page of this book', () => {
    for (const n of ['0', '4', '-1', '1.5', 'x', '', null, undefined]) expect(pageByNumber(n, pages)).toBeNull();
    expect(pageByNumber('1', [])).toBeNull();
  });
});

describe('lockedOverview / lockReturn', () => {
  it('carries the reader’s address to the overview and back', () => {
    const href = lockedOverview('bdlfs-seasparkles', '/w/bdlfs-seasparkles/read', '?n=66');
    expect(href).toBe('/w/bdlfs-seasparkles?go=%2Fw%2Fbdlfs-seasparkles%2Fread%3Fn%3D66');
    const go = new URL(href, 'https://x.test').searchParams.get('go');
    expect(lockReturn(go, 'bdlfs-seasparkles')).toBe('/w/bdlfs-seasparkles/read?n=66');
  });

  it('takes this book’s two readers, with or without a query', () => {
    expect(lockReturn('/w/vol-2/novel', 'vol-2')).toBe('/w/vol-2/novel');
    expect(lockReturn('/w/vol-2/novel?lang=ja', 'vol-2')).toBe('/w/vol-2/novel?lang=ja');
    expect(lockReturn('/w/vol-2/read?p=0000-aa&x=1', 'vol-2')).toBe('/w/vol-2/read?p=0000-aa&x=1');
  });

  it('refuses anything else that could arrive in the URL', () => {
    for (const go of [
      'https://evil.test/w/vol-2/read',
      '//evil.test/w/vol-2/read',
      '/w/other/read',
      '/w/vol-2',
      '/w/vol-2/read/../../studio',
      '/w/vol-2/readx',
      '/w/vol-2/read?a=/b',
      '/w/vol-2/read#x',
      'javascript:alert(1)',
      '/w/vol-2/read?q=' + 'x'.repeat(400),
      '',
      null,
    ]) {
      expect(lockReturn(go, 'vol-2')).toBeNull();
    }
  });
});

describe('readerSearch', () => {
  it('keeps the address on the page being read, so a reload stays there', () => {
    expect(readerSearch('?n=66', 'p70')).toBe('?p=p70');
    expect(readerSearch('?ch=c2', 'p70')).toBe('?p=p70');
    expect(readerSearch('?p=p1', 'p2')).toBe('?p=p2');
    expect(readerSearch('', 'p2')).toBe('?p=p2');
  });

  it('keeps anything else it was given', () => {
    expect(readerSearch('?lang=en&n=3', 'x')).toBe('?lang=en&p=x');
    expect(readerSearch('?n=3', null)).toBe('');
  });
});

describe('sectionParam / withoutParam', () => {
  it('takes a section index inside the book, nothing else', () => {
    expect(sectionParam('0', 11)).toBe(0);
    expect(sectionParam('10', 11)).toBe(10);
    for (const s of ['11', '-1', '1.5', 'x', '', null, undefined]) expect(sectionParam(s, 11)).toBeNull();
  });

  it('drops a used one-time parameter and keeps the rest', () => {
    expect(withoutParam('?lang=ja&s=3', 's')).toBe('?lang=ja');
    expect(withoutParam('?s=3', 's')).toBe('');
  });
});
