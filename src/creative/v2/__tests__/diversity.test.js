import { describe, it, expect } from 'vitest';
import { validateConceptDiversity } from '../diversity.js';
import { diverseConcepts } from './fixtures.js';

const clone = (c) => JSON.parse(JSON.stringify(c));

describe('E. concept diversity', () => {
  it('three materially different concepts PASS', () => {
    const r = validateConceptDiversity(diverseConcepts, { expected: 3 });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('present');
    expect(r.issues).toHaveLength(0);
  });

  it('duplicate strategic angles FAIL', () => {
    const c = [clone(diverseConcepts[0]), clone(diverseConcepts[1]), clone(diverseConcepts[2])];
    c[1].strategicAngle = c[0].strategicAngle; // identical angle
    const r = validateConceptDiversity(c, { expected: 3 });
    expect(r.ok).toBe(false);
    expect(r.action).toBe('regenerate');
    expect(r.issues.some((i) => i.axis === 'strategicAngle')).toBe(true);
  });

  it('duplicate hero objects are flagged', () => {
    const c = [clone(diverseConcepts[0]), clone(diverseConcepts[1]), clone(diverseConcepts[2])];
    c[2].heroObject = c[0].heroObject;
    const r = validateConceptDiversity(c, { expected: 3 });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.axis === 'heroObject')).toBe(true);
  });

  it('near-identical headline directions are flagged', () => {
    const c = [clone(diverseConcepts[0]), clone(diverseConcepts[1]), clone(diverseConcepts[2])];
    c[0].headlineDirection = 'מרכז שליטה אחד לכל העסק שלך';
    c[1].headlineDirection = 'מרכז שליטה אחד לכל העסק';
    const r = validateConceptDiversity(c, { expected: 3 });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.axis === 'headlineDirection')).toBe(true);
  });

  it('wrong concept count requests regeneration', () => {
    const r = validateConceptDiversity(diverseConcepts.slice(0, 2), { expected: 3 });
    expect(r.ok).toBe(false);
    expect(r.action).toBe('regenerate');
    expect(r.issues[0].axis).toBe('count');
  });
});
