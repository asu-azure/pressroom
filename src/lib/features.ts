/**
 * Music features — /ost, the NOW PLAYING band on the shelf, and the UI sounds
 * (notes of the theme song). The song is still a placeholder, so they stay OFF
 * in production and ON wherever `PUBLIC_MUSIC=true` is set (your local .env).
 * Turning them on for everyone = set PUBLIC_MUSIC=true in the Vercel project
 * env and redeploy. astro.config.mjs reads the same variable to decide whether
 * the /ost route exists at all.
 */
export const MUSIC = import.meta.env.PUBLIC_MUSIC === 'true';
