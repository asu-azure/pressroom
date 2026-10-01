/**
 * Share a link: a phone's own share sheet (LINE, X, …) on touch, the link
 * copied on a desktop — what each is expected to do. Lifted from the /asu
 * lightbox so the book overview shares the same way.
 */
export type ShareResult = 'shared' | 'copied' | 'dismissed' | 'failed';

export async function shareLink(s: { title: string; text?: string; url: string }): Promise<ShareResult> {
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share(s);
      return 'shared';
    } catch {
      return 'dismissed';
    }
  }
  try {
    await navigator.clipboard.writeText(s.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
