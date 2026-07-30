import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// api.deleteCharge — the ERROR CONTRACT, executed rather than read.
//
// WHY THIS FILE EXISTS. `financeReceivables.test.jsx` pins `deleteCharge` by
// SOURCE TEXT: that it calls the RPC, that it switches on `error.code`, that the
// two SQLSTATE constants are present. None of that ever RUNS the function, so
// none of it can tell you what a user actually sees when the server refuses.
// The refusal is the whole point of the slice — `public.delete_charge_if_unpaid`
// raises `23514` when a payment row exists, and if that never becomes the
// specific Hebrew message, the product tells the user "something went wrong"
// about a rule it enforced deliberately.
//
// WHAT THIS PROVES, AND WHAT IT CANNOT. It executes the SHIPPED function against
// a stubbed transport and follows the value through the REAL `userFacingError`
// with the REAL fallback string `store.jsx` passes — so the whole client half of
// the path is measured. It CANNOT prove that PostgREST delivers `23514` /
// `P0002` as `error.code` in the first place; that hop needs a live authenticated
// call. It was measured indirectly (an `anon` RPC call returns
// `{"code":"42501"}` — the raw SQLSTATE, verbatim), and the remaining
// confirmation is one two-tab run on a QA account.
//
// So: if the code arrives, this file guarantees the message. Whether it arrives
// is the open item, and this file does not pretend otherwise.
// ===================================================================

const rpc = vi.fn();

vi.mock('../supabase.js', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    // A direct table delete is the exact regression this slice removed — the
    // cascade path that destroyed payments. If deleteCharge ever reaches for it
    // again, this throws instead of quietly passing.
    from: () => { throw new Error('deleteCharge must not touch a table directly'); },
  },
  supabaseEnabled: true,
}));

const { deleteCharge } = await import('../api.js');
const { userFacingError } = await import('../userFacingError.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// The fallback is taken FROM store.jsx, not retyped here. If the store ever
// changes its wording, this test keeps comparing against the real one instead of
// silently asserting a string the product no longer uses.
const storeSrc = read('../../store/store.jsx');
const fallbackMatch = storeSrc.match(/userFacingError\(e,\s*'([^']+)'\),\s*'error'\)/);
const STORE_FALLBACK = fallbackMatch?.[1];

/** Run the shipped function and return what the user would be shown. */
async function shownToUser(error) {
  rpc.mockResolvedValue({ data: null, error });
  const err = await deleteCharge('ch1').then(() => null, (e) => e);
  return { err, shown: userFacingError(err, STORE_FALLBACK) };
}

beforeEach(() => { rpc.mockReset(); });

describe('deleteCharge · the RPC call itself', () => {
  it('calls delete_charge_if_unpaid with the named argument', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await deleteCharge('ch9');
    // The parameter NAME is part of the contract: PostgREST resolves the
    // function by argument name, so `chargeId` or a positional array would 404
    // against a live database while every source-text assertion still passed.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(['delete_charge_if_unpaid', { p_charge_id: 'ch9' }]);
  });

  it('resolves true on success', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(deleteCharge('ch9')).resolves.toBe(true);
  });
});

describe('deleteCharge · refusals become the SPECIFIC message', () => {
  it('the store fallback string was actually found in store.jsx', () => {
    // Positive control for this file's own harness. If the regex stopped
    // matching, STORE_FALLBACK would be undefined and every "not the fallback"
    // assertion below would pass vacuously.
    expect(STORE_FALLBACK, 'the receivables error fallback was not found in store.jsx').toBeTruthy();
    expect(STORE_FALLBACK).toContain('שגיאה');
  });

  it('23514 (a payment row exists) → the payments-exist message, not the fallback', async () => {
    const { err, shown } = await shownToUser({
      code: '23514',
      message: 'delete_charge_if_unpaid: charge ch1 has recorded payments and cannot be deleted',
      details: null,
      hint: null,
    });
    expect(shown).toBe('לחיוב הזה רשומים תשלומים, ולכן אי אפשר למחוק אותו. אפשר לבטל אותו, או למחוק קודם את התשלומים.');
    expect(shown).not.toBe(STORE_FALLBACK);
    // The technical message survives for diagnostics — userFacingError constrains
    // what is RENDERED, it never strips the Error.
    expect(err.message).toContain('delete_charge_if_unpaid');
  });

  it('P0002 (not found / not owned) → the not-found message', async () => {
    const { shown } = await shownToUser({
      code: 'P0002', message: 'delete_charge_if_unpaid: charge not found', details: null, hint: null,
    });
    expect(shown).toBe('החיוב לא נמצא. ייתכן שהוא כבר נמחק — רענן/י את המסך.');
    expect(shown).not.toBe(STORE_FALLBACK);
  });

  it('P0002 says nothing about ownership — the server does not distinguish, so neither may the UI', async () => {
    // The cross-account guarantee reaches all the way to the rendered string: a
    // message like "החיוב שייך לחשבון אחר" would leak, from the client, exactly
    // what the single raise site in the migration refuses to reveal.
    const { shown } = await shownToUser({ code: 'P0002', message: 'delete_charge_if_unpaid: charge not found' });
    for (const leak of ['חשבון אחר', 'הרשאה', 'שייך']) {
      expect(shown, `the not-found message must not hint at ownership ("${leak}")`).not.toContain(leak);
    }
  });
});

describe('deleteCharge · fail-closed on anything unrecognised', () => {
  it('an unknown SQLSTATE renders the generic fallback, not a guessed explanation', async () => {
    const { shown } = await shownToUser({ code: '08006', message: 'connection failure' });
    expect(shown).toBe(STORE_FALLBACK);
  });

  it('an error with NO code at all still fails closed', async () => {
    const { shown } = await shownToUser({ message: 'network down' });
    expect(shown).toBe(STORE_FALLBACK);
  });

  it('NEGATIVE CONTROL: a bare throw would fail the two assertions above', () => {
    // The specific-message assertions only have teeth because `userFacingError`
    // renders NOTHING it was not explicitly given. Proven here rather than
    // assumed: an Error carrying the identical technical text but no
    // `userMessage` — which is what `throw error` would produce — renders the
    // fallback. So if someone replaces engineError with a bare rethrow, the
    // 23514 and P0002 tests fail rather than silently keep passing.
    const bare = new Error('delete_charge_if_unpaid: charge ch1 has recorded payments and cannot be deleted');
    expect(userFacingError(bare, STORE_FALLBACK)).toBe(STORE_FALLBACK);
  });

  it('the classification is by code — an unknown code with refusal-like TEXT is still generic', () => {
    // Guards against the classification ever drifting back to substring matching
    // on `message`, which is untranslated, server-authored and free to change.
    return shownToUser({ code: '08006', message: 'charge has recorded payments' })
      .then(({ shown }) => expect(shown).toBe(STORE_FALLBACK));
  });
});
