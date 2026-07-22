import { describe, it, expect } from 'vitest';
import { mapToRow, rowToTask, TASK_FIELDS, nullifyBlankDates, buildBulkTaskRows } from '../api.js';

// S0B — task camelCase ↔ snake_case mapping (both directions).
describe('S0B · task API mapping', () => {
  it('write: mapToRow maps camel→snake writable fields; server-managed fields excluded', () => {
    const task = {
      id: 'tk_1', title: 'לשלוח סקיצה', projectId: 'pr_1', clientId: 'c1',
      status: 'in_progress', priority: 'high', deadline: '2026-08-01',
      assignee: 'נתן', linkRef: 'ref', notes: 'n', createdAt: 'x', updatedAt: 'y',
    };
    expect(mapToRow(task, TASK_FIELDS)).toEqual({
      title: 'לשלוח סקיצה', project_id: 'pr_1', client_id: 'c1',
      status: 'in_progress', priority: 'high', deadline: '2026-08-01',
      assignee: 'נתן', link_ref: 'ref', notes: 'n',
    });
    // id + created_at/updated_at are NOT written via the field map (server-managed / set explicitly).
    const row = mapToRow(task, TASK_FIELDS);
    expect(row.id).toBeUndefined();
    expect(row.created_at).toBeUndefined();
    expect(row.updated_at).toBeUndefined();
  });

  it('write: partial update maps only provided fields (status-only, null deadline)', () => {
    expect(mapToRow({ status: 'done' }, TASK_FIELDS)).toEqual({ status: 'done' });
    expect(mapToRow({ deadline: null }, TASK_FIELDS)).toEqual({ deadline: null });
    expect(mapToRow({ projectId: null, clientId: null }, TASK_FIELDS)).toEqual({ project_id: null, client_id: null });
  });

  it('read: rowToTask maps snake→camel including createdAt/updatedAt', () => {
    const row = {
      id: 'tk_1', project_id: 'pr_1', client_id: 'c1', title: 'x', status: 'review',
      priority: 'urgent', deadline: '2026-08-01', assignee: 'נתן', link_ref: 'r', notes: 'n',
      created_at: '2026-07-22T10:00:00Z', updated_at: '2026-07-22T11:00:00Z',
    };
    expect(rowToTask(row)).toEqual({
      id: 'tk_1', projectId: 'pr_1', clientId: 'c1', title: 'x', status: 'review',
      priority: 'urgent', deadline: '2026-08-01', assignee: 'נתן', linkRef: 'r', notes: 'n',
      createdAt: '2026-07-22T10:00:00Z', updatedAt: '2026-07-22T11:00:00Z',
    });
  });

  it('read: rowToTask tolerates nulls (standalone task: no project, no client) with defaults', () => {
    const t = rowToTask({ id: 'tk_2', project_id: null, client_id: null, title: 't',
      status: null, priority: null, deadline: null, assignee: null, link_ref: null, notes: null,
      created_at: null, updated_at: null });
    expect(t.projectId).toBeNull();
    expect(t.clientId).toBeNull();
    expect(t.status).toBe('new');       // default
    expect(t.priority).toBe('normal');  // default
    expect(t.deadline).toBeNull();
    expect(t.linkRef).toBe('');
  });
});

describe('S0B · optional date normalization (blank date → null at the DB boundary)', () => {
  it('blank task deadline normalizes to null; a real deadline is unchanged', () => {
    expect(nullifyBlankDates(mapToRow({ deadline: '' }, TASK_FIELDS))).toEqual({ deadline: null });
    expect(nullifyBlankDates(mapToRow({ deadline: '2026-08-01' }, TASK_FIELDS))).toEqual({ deadline: '2026-08-01' });
  });
  it('never blanket-converts other empty strings (only the date column)', () => {
    expect(nullifyBlankDates(mapToRow({ notes: '', title: '', linkRef: '' }, TASK_FIELDS)))
      .toEqual({ notes: '', title: '', link_ref: '' });
  });
});

describe('S0B · bulkUpload task rows (import / local→cloud migration)', () => {
  it('builds a task row: fresh TEXT id, remapped client_id, retained project_id, user_id', () => {
    const rows = buildBulkTaskRows(
      [{ id: 'tk_old', title: 't', projectId: 'pr_1', clientId: 'c_old', status: 'todo', priority: 'high', deadline: '2026-08-01' }],
      'user-1', { c_old: 'c_new' },
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(typeof r.id).toBe('string');
    expect(r.id).not.toBe('tk_old');   // fresh id — avoids PK collision on re-import
    expect(r.user_id).toBe('user-1');
    expect(r.client_id).toBe('c_new'); // remapped through clientIdMap
    expect(r.project_id).toBe('pr_1'); // retained (nullable text, no FK)
    expect(r.title).toBe('t');
    expect(r.deadline).toBe('2026-08-01');
  });
  it('standalone task (no client) → client_id null; blank deadline → null', () => {
    const rows = buildBulkTaskRows([{ id: 'x', title: 's', projectId: null, clientId: null, deadline: '' }], 'u', {});
    expect(rows[0].client_id).toBeNull();
    expect(rows[0].project_id).toBeNull();
    expect(rows[0].deadline).toBeNull();
  });
  it('empty / missing tasks is backward-compatible (returns [])', () => {
    expect(buildBulkTaskRows([], 'u', {})).toEqual([]);
    expect(buildBulkTaskRows(undefined, 'u')).toEqual([]);
  });
  it('the returned count equals the number of task rows built', () => {
    const rows = buildBulkTaskRows([{ id: 'a', title: '1' }, { id: 'b', title: '2' }], 'u', {});
    expect(rows.length).toBe(2);
  });
});
