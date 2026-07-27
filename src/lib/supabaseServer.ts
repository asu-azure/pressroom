/**
 * Server-side Supabase client — used ONLY to fill <head> metadata (see the
 * stack rule in CLAUDE.md). Reads public work fields so a shared link previews
 * with its real title, synopsis and cover instead of the generic site card.
 *
 * Same anon key + RLS boundary as the browser client; `service_role` still must
 * never exist anywhere in this project. Auth persistence is off because this
 * runs per request in a stateless server context — there is no session to keep,
 * and the default localStorage-backed auth machinery has nothing to talk to.
 *
 * Never use this to gate a render or to read anything user-specific. Every
 * caller must treat a failure as "fall back to the generic tags".
 */
import { createClient } from '@supabase/supabase-js';

export const supabaseServer = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
