// ===================================================================
// S0C — session-derived user identity (pure, no React/DOM/network).
//
// WHY: the cloud UI used to hardcode one person's identity (name, avatar
// initial, greetings, default task assignee) and one device-global Jake
// chat bucket. In a multi-user cloud beta every signed-in account must see
// its OWN identity, and per-device Jake state must be isolated per account.
//
// CONTRACT (locked S0C product decisions):
//   * Display name resolution order:
//       session.user.user_metadata.full_name
//       → session.user.user_metadata.name
//       → email prefix (before '@')
//       → 'משתמש' (neutral fallback — never another person's name).
//   * Storage-key scoping uses ONLY the stable Supabase user.id — never a
//     display name or email (names/emails can change or collide).
//   * No session (local/demo mode) scopes to a fixed '_local' bucket. The
//     PRE-S0C device-global keys (e.g. 'artvalue_jake_chat') are LEGACY:
//     they are never read, migrated, copied or deleted — a scoped key never
//     equals the bare legacy key, so stale chat can never be assigned to
//     the wrong account.
// ===================================================================

const FALLBACK_DISPLAY_NAME = 'משתמש';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// The user's display name for greetings, the topbar, avatar initials and
// default task assignee. Never throws; always returns a non-empty string.
export function resolveDisplayName(session) {
  const user = session && session.user ? session.user : null;
  const meta = user && user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const fromMeta = cleanString(meta.full_name) || cleanString(meta.name);
  if (fromMeta) return fromMeta;
  const email = cleanString(user && user.email);
  const prefix = email.includes('@') ? email.slice(0, email.indexOf('@')).trim() : '';
  if (prefix) return prefix;
  return FALLBACK_DISPLAY_NAME;
}

// Single-character avatar initial derived from the resolved display name.
export function avatarInitial(session) {
  return resolveDisplayName(session).charAt(0);
}

// Per-user localStorage key: `${base}_${user.id}` (stable Supabase uuid).
// Without a session (local/demo mode) → `${base}_local`. The result is
// NEVER the bare legacy base key, so legacy device-global state stays
// unread by construction.
export function userScopeKey(base, session) {
  const id = session && session.user && typeof session.user.id === 'string' ? session.user.id : '';
  return id ? `${base}_${id}` : `${base}_local`;
}
