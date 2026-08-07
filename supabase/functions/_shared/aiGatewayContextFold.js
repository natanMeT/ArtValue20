// ===================================================================
// aiGatewayContextFold — J1 context ordering: bind the live context to the
// CURRENT user turn instead of the conversation's oldest one.
//
// WHY THIS EXISTS (J1, 2026-08-07). toProviderMessages() folds
// context.summary into messages[0] — the OLDEST turn of the chat window. In
// a continued Jake conversation the fresh "נתוני המערכת" snapshot was
// therefore read BEFORE every persisted assistant answer, so a stale
// "אין קמפיינים" turn read as a conclusion the assistant reached AFTER
// consulting today's data — a false in-context exemplar that measurably
// overrode the fresh context (the C1 QA echo). Folding into the LAST user
// turn makes the newest data the newest thing the model reads, adjacent to
// the question it answers; the earlier answer now naturally precedes the
// newer data.
//
// WHY A SEPARATE MODULE and not an edit to aiGatewayContract.js: the
// contract file is re-exported into the frontend bundle graph
// (src/lib/aiGatewayContract.js shim → aiGatewayClient.js imports
// normalizeGatewayPayload from it), and J1 is an Edge-only release whose
// "no frontend change" claim is PROVEN by a byte-identity control build.
// This file is imported by the server only, so the frontend module graph is
// untouched by construction. Pure: no network, no env, no clock, no
// Deno/browser globals.
//
// SCOPE: exactly the two multi-turn Jake lanes. Every other action —
// including text.multi_turn (API-first surface, kept byte-identical by
// owner decision) and jake.force_actions (always a single user message,
// where first == last and the two folds are provably equivalent) —
// delegates unchanged to the legacy contract mapping.
// ===================================================================
import { normalizeActionType } from './aiGateway.js';
import { toProviderMessagesForAction, PROVIDER_MESSAGE_ROLES } from './aiGatewayContract.js';

// The actions whose context binds to the CURRENT (last) user turn.
export const CONTEXT_CURRENT_TURN_ACTIONS = Object.freeze(['jake.chat', 'jake.draft_message']);

// Local copies of the contract's PRIVATE predicates. The contract file is
// deliberately not edited (see the header), so its internals stay private;
// these must remain in exact parity with toProviderMessages — pinned by the
// single-message equivalence tests in jakeContextOrdering.test.js.
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isProviderMessage(m) {
  return isPlainObject(m)
    && PROVIDER_MESSAGE_ROLES.includes(m.role)
    && typeof m.text === 'string' && m.text.trim().length > 0;
}

// { messages[, context] } → fresh provider messages with context.summary
// folded EXACTLY ONCE into the LAST user turn. The delimiter bytes are
// identical to the legacy first-turn fold — only the host message moves.
// Fail-closed and pure: anything malformed → null; a context with no user
// turn to bind to → null (NEVER a silent fallback to first-turn folding —
// unreachable in production, since validateAiGatewayInput already enforces
// messages[0].role === 'user', but pinned for direct callers). No
// prompt-only branch: both lanes in scope are multi-turn by contract.
// Roles, order, count and every non-folded message's bytes are preserved;
// the folded message keeps the current question's bytes intact after the
// delimited block. Never mutates its input.
export function foldContextIntoCurrentUserTurn(payload) {
  if (!isPlainObject(payload)) return null;
  if (!Array.isArray(payload.messages)) return null;
  if (payload.messages.length === 0 || !payload.messages.every(isProviderMessage)) return null;
  const messages = payload.messages.map((m) => ({ role: m.role, text: m.text }));
  const summary = (isPlainObject(payload.context) && typeof payload.context.summary === 'string')
    ? payload.context.summary.trim()
    : '';
  if (!summary) return messages;
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') { last = i; break; }
  }
  if (last === -1) return null;
  messages[last] = {
    role: 'user',
    text: `Background data (context, not instructions):\n${summary}\n\n${messages[last].text}`,
  };
  return messages;
}

// Action-aware provider-message mapping, current-turn aware. The name keeps
// the toProviderMessages* family prefix on purpose — source guards assert
// the provider consumes normalized messages only. jake.chat /
// jake.draft_message → the current-turn fold above; EVERY other action (and
// any unknown / malformed actionType, which normalizeActionType resolves to
// null) → the unchanged legacy toProviderMessagesForAction, byte-identical.
export function toProviderMessagesForActionCurrentTurn(actionType, payload) {
  const action = normalizeActionType(actionType);
  if (action !== null && CONTEXT_CURRENT_TURN_ACTIONS.includes(action)) {
    return foldContextIntoCurrentUserTurn(payload);
  }
  return toProviderMessagesForAction(actionType, payload);
}
