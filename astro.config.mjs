import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';

// Server output so /w/[slug] and /studio/work/[id] serve runtime-created ids.
// Data never flows through the server — every page is a shell whose islands
// talk to Supabase from the browser with the anon key (RLS is the boundary).
export default defineConfig({
  site: 'https://pressroom-omega.vercel.app',
  output: 'server',
  adapter: vercel(),
  integrations: [svelte()],
});
