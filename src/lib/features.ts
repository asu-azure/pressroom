/**
 * Music features — /music (the CD crate), its homepage section and menu link,
 * /ost/tobira, and the UI sounds (notes of ナガレボシ's motif). ON wherever
 * `PUBLIC_MUSIC=true` is set: your local .env and Vercel's Preview. Production
 * had it from 4 Oct 2026 and was switched off on 14 Oct while the crate was
 * rebuilt; turning it back on = add PUBLIC_MUSIC=true to Vercel's Production
 * env and redeploy without the build cache. astro.config.mjs reads the same
 * variable to decide whether the music routes exist at all.
 */
export const MUSIC = import.meta.env.PUBLIC_MUSIC === 'true';
