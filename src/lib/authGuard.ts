import { supabase } from './supabase';

/**
 * Client-side gate for /studio routes — UX only, NOT security (RLS is the
 * boundary; see CLAUDE.md). Resolves with the session, or redirects to login.
 */
export async function requireSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.href = '/studio/login';
    return false;
  }
  return true;
}

export function watchSignOut(): void {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.href = '/studio/login';
  });
}
