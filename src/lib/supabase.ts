import { createClient } from '@supabase/supabase-js';

// Anon key only — RLS is the security boundary (see CLAUDE.md).
// The service_role key must never exist anywhere in this project.
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
);
