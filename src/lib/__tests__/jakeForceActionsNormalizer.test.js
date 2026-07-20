import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeActionsBlockResult,
  ACTIONS_BLOCK_EMPTY_RESULT,
  validateAiGatewayInput,
} from '../aiGatewayContract.js';
import {
  getActionProfile,
  ACTION_PROFILE_KEYS,
} from '../../../supabase/functions/ai-gateway/actionProfiles.ts';
import { extractActions } from '../jakeAgent.js';

// M2 J1 fix — deterministic raw output for the jake.force_actions Gateway
// lane. The pure normalizer collapses whatever the provider emitted into
// exactly ONE canonical fenced ```actions block (re-serialized JSON) or
// exactly "[]" — provider prose, checkmarks, and echoed instructions never
// reach the client. The server never interprets or executes the ops.

const FORCE = 'jake.force_actions';
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const block = (inner) => '```actions\n' + inner + '\n```';

// ---------------------------------------------------------------
// 1) canonical success path
// ---------------------------------------------------------------
describe('normalizeActionsBlockResult · canonical actions block', () => {
  const ACTIONS = [{ op: 'add_client', name: 'דני כהן', status: 'lead', value: 3000 }];
  const CANONICAL = block(JSON.stringify(ACTIONS));

  it('a clean fenced block normalizes to exactly the canonical block', () => {
    const raw = block('[ { "op": "add_client", "name": "דני כהן", "status": "lead", "value": 3000 } ]');
    expect(normalizeActionsBlockResult(raw)).toBe(CANONICAL);
  });

  it('surrounding provider prose / checkmarks / echoed instructions are ALL stripped', () => {
    const noisy =
      'בסדר גמור! אוסיף את דני כהן ✓\n\n' +
      'החזר אך ורק בלוק ```actions עם מערך JSON — הנה הבלוק:\n' +
      block('[{"op":"add_client","name":"דני כהן","status":"lead","value":3000}]') +
      '\n\nביצעתי את הפעולה בהצלחה ✓ אם תרצה עוד משהו אני כאן.';
    const out = normalizeActionsBlockResult(noisy);
    expect(out).toBe(CANONICAL);
    expect(out.includes('✓')).toBe(false);
    expect(out.includes('אוסיף')).toBe(false);
    expect(out.includes('החזר אך ורק')).toBe(false);
  });

  it('the array is RE-SERIALIZED — provider JSON bytes (whitespace/newlines) never pass through', () => {
    const pretty = block('[\n  {\n    "op": "add_client",\n    "name": "דני כהן",\n    "status": "lead",\n    "value": 3000\n  }\n]');
    expect(normalizeActionsBlockResult(pretty)).toBe(CANONICAL);
  });

  it('multiple ops survive in order; Hebrew text is preserved byte-exact', () => {
    const raw = block('[{"op":"add_client","name":"רות לוי"},{"op":"mark_paid","client":"רות לוי","amount":2500}]');
    expect(normalizeActionsBlockResult(raw)).toBe(
      block('[{"op":"add_client","name":"רות לוי"},{"op":"mark_paid","client":"רות לוי","amount":2500}]'),
    );
  });

  it('tolerates CRLF, label case, and fence-label spacing on INPUT — output fence is always canonical lowercase', () => {
    for (const raw of [
      '```actions\r\n[{"op":"delete_item","item":"מסגרת"}]\r\n```',
      '```ACTIONS\n[{"op":"delete_item","item":"מסגרת"}]\n```',
      '``` actions \n[{"op":"delete_item","item":"מסגרת"}]```',
    ]) {
      expect(normalizeActionsBlockResult(raw)).toBe(block('[{"op":"delete_item","item":"מסגרת"}]'));
    }
  });

  it('first VALID block wins: an earlier broken block is skipped, later duplicate blocks are dropped', () => {
    const raw =
      block('[{ broken json !!') + '\n' +
      block('[{"op":"add_stock","item":"בד קנבס","amount":5}]') + '\n' +
      block('[{"op":"delete_all","entity":"clients"}]');
    expect(normalizeActionsBlockResult(raw)).toBe(block('[{"op":"add_stock","item":"בד קנבס","amount":5}]'));
  });

  it('a fenced block whose body is a JSON OBJECT (not array) is skipped', () => {
    expect(normalizeActionsBlockResult(block('{"op":"add_client","name":"x"}'))).toBe('[]');
    // ...but a later valid array block still wins
    const raw = block('{"op":"x"}') + '\n' + block('[{"op":"add_income","amount":100}]');
    expect(normalizeActionsBlockResult(raw)).toBe(block('[{"op":"add_income","amount":100}]'));
  });

  it('deterministic: identical input → identical output', () => {
    const raw = 'טקסט\n' + block('[{"op":"add_task","title":"להתקשר לדני"}]') + '\nעוד טקסט';
    expect(normalizeActionsBlockResult(raw)).toBe(normalizeActionsBlockResult(raw));
  });
});

// ---------------------------------------------------------------
// 2) empty / fail-closed path — always exactly "[]"
// ---------------------------------------------------------------
describe('normalizeActionsBlockResult · fail-closed to exactly "[]"', () => {
  it('the exported empty result IS the literal "[]"', () => {
    expect(ACTIONS_BLOCK_EMPTY_RESULT).toBe('[]');
  });

  it('an empty array block → exactly "[]" (no fence)', () => {
    expect(normalizeActionsBlockResult(block('[]'))).toBe('[]');
    expect(normalizeActionsBlockResult(block('[ ]'))).toBe('[]');
    expect(normalizeActionsBlockResult('אין פעולה מתאימה.\n' + block('[]') + '\nזהו.')).toBe('[]');
  });

  it('a bare unfenced "[]" (the instruction\'s no-action form) → exactly "[]"', () => {
    expect(normalizeActionsBlockResult('[]')).toBe('[]');
    expect(normalizeActionsBlockResult('  []  ')).toBe('[]');
  });

  it('prose with NO valid block → "[]" (prose never reaches the client)', () => {
    for (const raw of [
      'לא מצאתי פעולה מתאימה לבקשה הזו.',
      'הוספתי את דני כהן ✓', // fake-done claim with no block
      '```json\n[{"op":"add_client","name":"x"}]\n```', // wrong label
      '```\n[{"op":"add_client","name":"x"}]\n```', // unlabelled fence
      '```actions\n[{"op":"add_client"}]', // unterminated fence (truncated output)
      block('null'), block('"[]"'), block('42'), block('true'),
      block('not json at all'),
    ]) {
      expect(normalizeActionsBlockResult(raw), JSON.stringify(raw.slice(0, 40))).toBe('[]');
    }
  });

  it('non-string input → "[]" and NEVER throws', () => {
    for (const raw of [null, undefined, 42, 0, true, false, {}, [], ['```actions'], () => {}, Symbol('x'), 10n, '', '   \n  ']) {
      expect(() => normalizeActionsBlockResult(raw)).not.toThrow();
      expect(normalizeActionsBlockResult(raw)).toBe('[]');
    }
  });

  it('prototype-polluting keys anywhere in the parsed array → "[]" (fail closed, not sanitized)', () => {
    for (const inner of [
      '[{"op":"add_client","__proto__":{"polluted":1}}]',
      '[{"op":"add_client","constructor":{"x":1}}]',
      '[{"op":"add_client","prototype":{}}]',
      '[{"op":"update_client","name":"x","fields":{"__proto__":{"a":1}}}]',
      '[[{"__proto__":{}}]]',
    ]) {
      expect(normalizeActionsBlockResult(block(inner)), inner).toBe('[]');
    }
    expect(({}).polluted).toBe(undefined);
  });
});

// ---------------------------------------------------------------
// 3) the server does NOT interpret CRM actions
// ---------------------------------------------------------------
describe('normalizeActionsBlockResult · no server-side action interpretation', () => {
  it('unknown / invented op names pass through untouched — op vocabulary stays a FRONTEND concern', () => {
    const raw = block('[{"op":"made_up_op","target":"whatever"}]');
    expect(normalizeActionsBlockResult(raw)).toBe(block('[{"op":"made_up_op","target":"whatever"}]'));
  });

  it('field values are not validated, coerced, or repaired', () => {
    const raw = block('[{"op":"add_client","name":"","value":"not-a-number","status":"no-such-status"}]');
    expect(normalizeActionsBlockResult(raw)).toBe(
      block('[{"op":"add_client","name":"","value":"not-a-number","status":"no-such-status"}]'),
    );
  });
});

// ---------------------------------------------------------------
// 4) frontend compatibility — extractActions semantics unchanged
// ---------------------------------------------------------------
describe('canonical output · frontend extractActions parses it exactly as before', () => {
  it('extractActions recovers the SAME ops from the canonical block as from the noisy raw text', () => {
    const noisy =
      'אוסיף את דני כהן ✓\n' +
      block('[{"op":"add_client","name":"דני כהן","status":"lead","value":3000},{"op":"add_task","title":"להתקשר"}]') +
      '\nבוצע!';
    const normalized = normalizeActionsBlockResult(noisy);
    const fromNoisy = extractActions(noisy).actions;
    const fromNormalized = extractActions(normalized).actions;
    expect(fromNormalized).toEqual(fromNoisy);
    expect(fromNormalized.map((a) => a.op)).toEqual(['add_client', 'add_task']);
    // and the normalized text carries NO leftover prose for the chat bubble
    expect(extractActions(normalized).clean).toBe('');
  });

  it('the "[]" empty result parses to zero actions and empty clean text', () => {
    const parsed = extractActions('[]');
    expect(parsed.actions).toEqual([]);
    expect(parsed.clean).toBe('');
  });
});

// ---------------------------------------------------------------
// 5) profile + provider wiring (server-owned, force-actions only)
// ---------------------------------------------------------------
describe('resultTransform wiring · jake.force_actions only', () => {
  it('jake.force_actions profile pins resultTransform: "actions_block"; everything else stays null', () => {
    const force = getActionProfile(FORCE);
    expect(force.resultTransform).toBe('actions_block');
    expect(Object.isFrozen(force)).toBe(true);
    for (const action of ACTION_PROFILE_KEYS) {
      if (action === FORCE) continue;
      expect(getActionProfile(action).resultTransform, action).toBe(null);
    }
  });

  it('geminiProvider routes the actions_block transform through the pure normalizer, AFTER the json branch, keeping raw result_chars', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    expect(code.includes('normalizeActionsBlockResult')).toBe(true);
    const jsonBranch = code.indexOf("profile.outputMode === 'json'");
    const transformBranch = code.indexOf("profile.resultTransform === 'actions_block'");
    const plainReturn = code.indexOf('buildProviderSuccessResponse(decision, rawText)');
    expect(jsonBranch).toBeGreaterThan(-1);
    expect(transformBranch).toBeGreaterThan(jsonBranch);
    expect(plainReturn).toBeGreaterThan(transformBranch); // untransformed text path preserved
    expect(code.includes('buildProviderSuccessResponse(decision, normalizeActionsBlockResult(rawText))')).toBe(true);
    // result_chars still counts the RAW provider text (computed before the branch)
    expect(code.indexOf('providerResultChars(rawText)')).toBeLessThan(transformBranch);
  });

  it('resultTransform is caller-unreachable: the strict input contract rejects it as an unknown key', () => {
    const r = validateAiGatewayInput(FORCE, {
      messages: [{ role: 'user', text: 'תוסיף את דני' }],
      resultTransform: null,
    });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('invalid_payload');
  });
});
