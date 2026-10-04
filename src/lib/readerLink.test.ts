import { describe, expect, it } from 'vitest';
import { lockReturn, lockedOverview, pageByNumber } from './readerLink';

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
