// Persistence-aware save-toast wording.
//
// The store persists to Supabase when it runs in 'supabase' mode (a
// configured client + signed-in session drive every dispatch through
// api.*), and to localStorage in 'local'/demo mode. A success toast must
// reflect where the row actually went — "נשמר מקומית" on a real server
// save is misleading (the row provably lives in public.clients).
//
// Pure and tiny so pages can share it and tests can pin the distinction.
export function saveLabel(mode) {
  return mode === 'supabase' ? 'נשמר במערכת' : 'נשמר מקומית';
}
