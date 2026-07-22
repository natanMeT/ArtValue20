import { describe, it, expect } from 'vitest';
import { mapToRow, rowToClient, CLIENT_FIELDS, nullifyBlankDates } from '../api.js';

// S0B — client follow-up fields (next_action / next_action_date) now map in both
// directions. Before S0B they were silently dropped by the client column map.
describe('S0B · client follow-up mapping', () => {
  it('CLIENT_FIELDS includes the follow-up mappings', () => {
    expect(CLIENT_FIELDS.nextAction).toBe('next_action');
    expect(CLIENT_FIELDS.nextActionDate).toBe('next_action_date');
  });

  it('write: mapToRow now writes next_action / next_action_date (previously dropped)', () => {
    const client = { id: 'c1', name: 'דני', status: 'active', value: 3000,
      nextAction: 'להתקשר מחר', nextActionDate: '2026-08-01' };
    const row = mapToRow(client, CLIENT_FIELDS);
    expect(row.next_action).toBe('להתקשר מחר');
    expect(row.next_action_date).toBe('2026-08-01');
    expect(row.name).toBe('דני'); // existing fields still mapped
  });

  it('read: rowToClient reads the follow-up fields back', () => {
    const c = rowToClient({ id: 'c1', name: 'דני', status: 'active', value: 3000,
      next_action: 'לשלוח הצעה', next_action_date: '2026-08-05' });
    expect(c.nextAction).toBe('לשלוח הצעה');
    expect(c.nextActionDate).toBe('2026-08-05');
  });

  it('read: rowToClient defaults follow-up fields when absent (backward compatible)', () => {
    const c = rowToClient({ id: 'c1', name: 'x', status: 'lead', value: 0 });
    expect(c.nextAction).toBe('');
    expect(c.nextActionDate).toBeNull();
  });
});

describe('S0B · client follow-up date normalization (blank → null at the DB boundary)', () => {
  it('blank nextActionDate → null; a real date is unchanged', () => {
    expect(nullifyBlankDates(mapToRow({ nextActionDate: '' }, CLIENT_FIELDS))).toEqual({ next_action_date: null });
    expect(nullifyBlankDates(mapToRow({ nextActionDate: '2026-08-05' }, CLIENT_FIELDS))).toEqual({ next_action_date: '2026-08-05' });
  });
  it('nextAction text is never coerced (only the date column is normalized)', () => {
    expect(nullifyBlankDates(mapToRow({ nextAction: '', name: 'x' }, CLIENT_FIELDS))).toEqual({ next_action: '', name: 'x' });
  });
});
