// ===================================================================
// Gemini execution adapter (server-only) — M2 Slice 2C.
//
// The ONE adapter the ai-gateway shell registers into its execution
// registry. Executable members are DIRECT REFERENCES to the existing
// provider implementation — nothing is wrapped, copied, or reimplemented
// here, so execution stays byte-identical:
//   run          === runGeminiText   (unchanged { status, body, resultChars })
//   isConfigured === isGeminiConfigured
//
// This module holds NO env access, NO endpoint/model/request/parsing
// logic, and NO response builders — all of that remains solely in
// geminiProvider.ts and the pure shared contract. The registry never
// invokes these functions (typeof capture only), and the shell never
// calls isConfigured — runGeminiText's internal key check remains the
// authoritative fail-closed 503 path.
// ===================================================================

import { isGeminiConfigured, runGeminiText } from './geminiProvider.ts';

// Shape matches validateProviderAdapterShape exactly:
// { provider, capabilities, isConfigured, run } and nothing else.
export const geminiAdapter = Object.freeze({
  provider: 'gemini',
  capabilities: Object.freeze(['text', 'json', 'multi_turn']),
  isConfigured: isGeminiConfigured,
  run: runGeminiText,
});

// ---- server-owned capability requirements per executable action ----
// STATIC map keyed ONLY by the validated actionType. No caller option,
// payload field, or frontend data can influence it. `output` doubles as a
// runtime drift guard against the server-owned action profile: if the
// profile's outputMode disagrees with this map (or is missing/unsupported),
// the answer is null and the shell fails CLOSED through its existing
// provider-error path — a mismatch is never silently inferred, repaired,
// or normalized.
interface CapabilityRule {
  readonly output: 'text' | 'json';
  readonly capabilities: readonly string[];
}

const TEXT_ONLY: CapabilityRule = Object.freeze({
  output: 'text' as const,
  capabilities: Object.freeze(['text']),
});
const TEXT_MULTI_TURN: CapabilityRule = Object.freeze({
  output: 'text' as const,
  capabilities: Object.freeze(['text', 'multi_turn']),
});
const JSON_ONLY: CapabilityRule = Object.freeze({
  output: 'json' as const,
  capabilities: Object.freeze(['json']),
});

const REQUIRED_CAPABILITIES_BY_ACTION: Readonly<Record<string, CapabilityRule>> = Object.freeze({
  'text.copy': TEXT_ONLY,
  'text.crm_message': TEXT_ONLY,
  'studio.prompt_enhance': TEXT_ONLY,
  'crm.suggest_next_action': JSON_ONLY,
  'text.multi_turn': TEXT_MULTI_TURN,
  'jake.draft_message': TEXT_MULTI_TURN,
  'jake.chat': TEXT_MULTI_TURN,
  'jake.force_actions': TEXT_MULTI_TURN,
});

// Exported for coverage tests only (key set must exactly equal the
// executable-action vocabulary; a drift fails tests, not production).
export const REQUIRED_CAPABILITY_ACTION_KEYS: readonly string[] = Object.freeze(
  Object.keys(REQUIRED_CAPABILITIES_BY_ACTION),
);

// Resolve the frozen required-capability list for a VALIDATED actionType and
// its resolved server-owned profile, or null (fail closed, never throws):
//   - unknown/hostile actionType → null
//   - missing/malformed profile → null
//   - profile.outputMode disagrees with the map (drift) → null
export function requiredGatewayCapabilities(
  actionType: unknown,
  profile: unknown,
): readonly string[] | null {
  try {
    if (typeof actionType !== 'string'
      || !Object.prototype.hasOwnProperty.call(REQUIRED_CAPABILITIES_BY_ACTION, actionType)) {
      return null;
    }
    const rule = REQUIRED_CAPABILITIES_BY_ACTION[actionType];
    if (profile === null || typeof profile !== 'object') return null;
    const outputMode = (profile as { outputMode?: unknown }).outputMode;
    if (outputMode !== rule.output) return null;
    return rule.capabilities;
  } catch {
    return null;
  }
}
