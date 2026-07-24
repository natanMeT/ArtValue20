import { describe, it, expect } from 'vitest';
import { fromProfile, shouldAdoptSaved } from '../BusinessContextEditor.jsx';

// ===================================================================
// BusinessContextEditor — authoritative-resync decision + form mapping (S0D P2).
// (No DOM renderer in this repo; the resync rule is a pure exported function.)
// ===================================================================

const A = { businessName: 'סטודיו אלפא', positioning: 'עיצוב', audiences: ['יזמים'], tone: [], differentiators: [], services: [{ name: 'מיתוג', pitch: 'לוגו' }], brandPalette: { primary: '#112233' } };
const B = { businessName: 'מאפיית בטא', positioning: 'לחם', audiences: [], tone: ['חם'], differentiators: [], services: [], brandPalette: null };
const key = (p) => JSON.stringify(fromProfile(p));

describe('fromProfile', () => {
  it('null → an empty (unconfigured) form, no ArtValue prefill', () => {
    expect(fromProfile(null)).toEqual({ businessName: '', positioning: '', audiences: [], tone: [], differentiators: [], services: [], brandPalette: {} });
  });
  it('maps a saved profile into an editable form shape', () => {
    expect(fromProfile(A)).toEqual({
      businessName: 'סטודיו אלפא', positioning: 'עיצוב', audiences: ['יזמים'], tone: [], differentiators: [],
      services: [{ name: 'מיתוג', pitch: 'לוגו' }], brandPalette: { primary: '#112233' },
    });
  });
});

describe('shouldAdoptSaved · authoritative resync vs dirty preservation', () => {
  it('CLEAN form + authoritative change → adopt', () => {
    // form equals current baseline (no unsaved edits); saved changed A → B
    expect(shouldAdoptSaved({ formKey: key(A), baselineKey: key(A), savedKey: key(B) })).toBe(true);
  });

  it('DIRTY form + authoritative change → preserve the user edits', () => {
    const dirtyForm = { ...fromProfile(A), businessName: 'טיוטה לא שמורה' };
    expect(shouldAdoptSaved({ formKey: JSON.stringify(dirtyForm), baselineKey: key(A), savedKey: key(B) })).toBe(false);
  });

  it('no authoritative change (saved === baseline) → no-op even if clean', () => {
    expect(shouldAdoptSaved({ formKey: key(A), baselineKey: key(A), savedKey: key(A) })).toBe(false);
  });

  it('failed-save scenario: saved reverts to baseline while form is dirty → keep dirty input', () => {
    const dirtyForm = { ...fromProfile(A), positioning: 'עריכה שנכשלה' };
    // refetch restored the old saved (=== baseline) → savedKey === baselineKey → keep
    expect(shouldAdoptSaved({ formKey: JSON.stringify(dirtyForm), baselineKey: key(A), savedKey: key(A) })).toBe(false);
  });
});
