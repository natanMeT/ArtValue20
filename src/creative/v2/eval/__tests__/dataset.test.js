// Validates the committed dataset (briefs, goldens, snapshot) and proves the
// committed v1Snapshots.json is exactly the deterministic builder output (so the
// baseline can't be hand-tampered out of sync with its source).
import { describe, it, expect } from 'vitest';
import { BRIEFS } from '../briefs.js';
import { GOLDENS } from '../goldens.js';
import { buildSnapshotFile } from '../buildBaseline.js';
import { validateBrief, validateGolden, validateSnapshotFile } from '../goldenSchema.js';
import SNAPSHOT from '../v1Snapshots.json';

describe('eval dataset integrity', () => {
  it('has exactly 10 briefs across distinct categories', () => {
    expect(BRIEFS).toHaveLength(10);
    expect(new Set(BRIEFS.map((b) => b.category)).size).toBe(10);
  });

  it('every brief validates', () => {
    BRIEFS.forEach((b) => { const v = validateBrief(b); expect(v.ok, `${b.id}: ${v.errors.join(';')}`).toBe(true); });
  });

  it('the committed snapshot file validates against the canonical contract', () => {
    const v = validateSnapshotFile(SNAPSHOT);
    expect(v.ok, v.errors.join(';')).toBe(true);
    expect(Object.keys(SNAPSHOT.snapshots)).toHaveLength(10);
    expect(SNAPSHOT.meta.source).toBe('fixture-synthetic'); // honestly marked
  });

  it('every golden validates and is pinned to its snapshot concept ids', () => {
    BRIEFS.forEach((b) => {
      const g = GOLDENS[b.id];
      expect(g, `missing golden for ${b.id}`).toBeTruthy();
      const conceptIds = SNAPSHOT.snapshots[b.id].samples[0].result.concepts.map((c) => c.id);
      const v = validateGolden(g, conceptIds);
      expect(v.ok, `${b.id}: ${v.errors.join(';')}`).toBe(true);
      expect(g.snapshotRef).toBe(`${b.id}#sample0`);
    });
  });

  it('the committed snapshot is reproducible from the builder (no drift / tampering)', () => {
    const rebuilt = buildSnapshotFile({ createdAt: SNAPSHOT.meta.createdAt });
    expect(rebuilt).toEqual(SNAPSHOT);
  });
});
