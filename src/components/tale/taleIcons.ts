// Sticker icons for the tale theme — drawn for Pressroom, not taken from any
// source site. Each value is the inner markup of a 24×24 SVG, so Astro renders
// it with set:html and Svelte with {@html}. Filled shapes use currentColor;
// the asterisk is stroked.
export const taleIcons = {
  star: '<path d="M12 2.8l2.75 5.72 6.3.83-4.6 4.37 1.16 6.24L12 16.9l-5.61 3.06 1.16-6.24-4.6-4.37 6.3-.83z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  moon: '<path d="M19.6 14.9A8.4 8.4 0 0 1 9.1 4.4a8.4 8.4 0 1 0 10.5 10.5z"/>',
  paw:
    '<ellipse cx="12" cy="16.2" rx="4.6" ry="3.9"/><circle cx="6.3" cy="10.6" r="2.1"/><circle cx="9.7" cy="6.9" r="2.2"/>' +
    '<circle cx="14.3" cy="6.9" r="2.2"/><circle cx="17.7" cy="10.6" r="2.1"/>',
  tri: '<path d="M12 4.2 21 19.6H3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  spark:
    '<path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  heart:
    '<path d="M16.29 3.3C14.57 3.3 13.05 4.06 12 5.29 10.95 4.06 9.33 3.3 7.62 3.3 4.57 3.3 2 5.86 2 8.9v.57c.38 4.66 5.33 8.55 8.29 10.35.47.29 1.04.48 1.71.48.57 0 1.14-.19 1.71-.48 2.96-1.9 7.91-5.7 8.29-10.35V8.9c0-3.04-2.57-5.6-5.71-5.6Z"/>',
  lock:
    '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/>',
} as const;

export type TaleIconName = keyof typeof taleIcons;
