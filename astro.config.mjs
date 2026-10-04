import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Music features (see src/lib/features.ts) are off unless PUBLIC_MUSIC=true.
// When off, the /ost route is not registered at all, so it is a real 404
// rather than a hidden page.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const music = (process.env.PUBLIC_MUSIC ?? env.PUBLIC_MUSIC) === 'true';

/** @type {import('astro').AstroIntegration} */
const musicRoutes = {
  name: 'pressroom-music-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (!music) return;
      injectRoute({ pattern: '/ost', entrypoint: './src/routes/ost.astro' });
      // the 扉の向こう moving score, kept unlisted (see the file's header)
      injectRoute({ pattern: '/ost/tobira', entrypoint: './src/routes/ost-tobira.astro' });
    },
    // public/ost/ holds the songs' MP3s; with music off they must not ship.
    // Removed from both the client dir and the Vercel static output, whichever
    // this hook runs before or after the adapter's copy.
    'astro:build:done': ({ dir }) => {
      if (music) return;
      rmSync(new URL('./ost/', dir), { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('./.vercel/output/static/ost/', import.meta.url)), { recursive: true, force: true });
    },
  },
};

// Server output so /w/[slug] and /studio/work/[id] serve runtime-created ids.
// Data never flows through the server — every page is a shell whose islands
// talk to Supabase from the browser with the anon key (RLS is the boundary).
export default defineConfig({
  site: 'https://pressroom-omega.vercel.app',
  output: 'server',
  adapter: vercel(),
  integrations: [svelte(), musicRoutes],
  // Hover/focus prefetch only. Prefetching every link in view would fire an SSR
  // function per shelf card; cards prefetch themselves on pointerenter instead
  // (WorkCard.svelte), since they render after the load-time link scan.
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
});
