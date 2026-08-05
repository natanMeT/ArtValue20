import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createGalleryUploadHandler, readAssetSignature,
  UPLOAD_SIGNATURE_MISMATCH_HE, UPLOAD_SUCCESS_HE, UPLOAD_FAILURE_HE,
} from '../ImageStudio.jsx';
import { ASSET_SIGNATURE_BYTES } from '../../lib/assetLibrary.js';

// ===================================================================
// Asset Library slice 4 — the upload handler and its screen wiring.
//
// The handler is a FACTORY so it can be executed rather than read: these tests
// run the shipped function, they do not pin its source text. The JSX-level
// facts (which cannot be executed without a renderer, and this repo has none)
// are scanned from the real file WITH negative controls, so the scan cannot
// pass vacuously.
// ===================================================================

const SRC = path.join(process.cwd(), 'src');
const IMAGE_STUDIO = fs.readFileSync(path.join(SRC, 'pages/ImageStudio.jsx'), 'utf8');

// A minimal File stand-in: enough surface for the handler, no jsdom needed.
const fakeFile = (type = 'image/png', size = 1024) => ({
  type,
  size,
  slice: () => ({ arrayBuffer: async () => new Uint8Array(ASSET_SIGNATURE_BYTES).buffer }),
});

// The <input> the change event came from. `files` is what the handler reads and
// `value` is what it must reset on every path.
const fakeEvent = (file) => ({ target: { files: file ? [file] : [], value: 'C:\\fakepath\\x.png' } });

const harness = (over = {}) => {
  const busyRef = { current: false };
  const store = { add: vi.fn().mockResolvedValue('new-id'), ...(over.store || {}) };
  const ctx = {
    store,
    getCount: over.getCount || (() => 3),
    refresh: vi.fn().mockResolvedValue(undefined),
    toast: vi.fn(),
    busyRef,
    setBusy: vi.fn(),
    readSignature: over.readSignature || (async () => null), // 'unreadable' -> proceeds
  };
  return { ctx, busyRef, handler: createGalleryUploadHandler(ctx) };
};

describe('the happy path', () => {
  it('passes the FILE ITSELF, the upload meta and the current count', async () => {
    const { ctx, handler } = harness();
    const file = fakeFile();
    await handler(fakeEvent(file));
    expect(ctx.store.add).toHaveBeenCalledTimes(1);
    const [passed, meta, count] = ctx.store.add.mock.calls[0];
    // Byte-identical: the same object reference, never a re-encode.
    expect(passed).toBe(file);
    expect(meta).toEqual({ source: 'upload' });
    expect(count).toBe(3);
  });

  it('re-reads from the server and only THEN claims success', async () => {
    const { ctx, handler } = harness();
    const order = [];
    ctx.store.add.mockImplementation(async () => { order.push('add'); return 'id'; });
    ctx.refresh.mockImplementation(async () => { order.push('refresh'); });
    ctx.toast.mockImplementation(() => { order.push('toast'); });
    await handler(fakeEvent(fakeFile()));
    // PERSIST-FIRST: no optimistic item, and the toast is last.
    expect(order).toEqual(['add', 'refresh', 'toast']);
    expect(ctx.toast).toHaveBeenCalledWith(UPLOAD_SUCCESS_HE);
  });

  it('proceeds when the signature is unreadable', async () => {
    const { ctx, handler } = harness({ readSignature: async () => null });
    await handler(fakeEvent(fakeFile()));
    expect(ctx.store.add).toHaveBeenCalledTimes(1);
  });
});

describe('refusal before any network call', () => {
  it('refuses a signature mismatch and never calls add', async () => {
    // A JPEG body declared as PNG.
    const jpeg = new Uint8Array(ASSET_SIGNATURE_BYTES);
    jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff;
    const { ctx, handler } = harness({ readSignature: async () => jpeg });
    await handler(fakeEvent(fakeFile('image/png')));
    expect(ctx.store.add).not.toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith(UPLOAD_SIGNATURE_MISMATCH_HE, 'error');
  });

  it('says nothing at all when the picker was cancelled', async () => {
    const { ctx, handler } = harness();
    await handler(fakeEvent(null));
    expect(ctx.store.add).not.toHaveBeenCalled();
    expect(ctx.toast).not.toHaveBeenCalled();
  });
});

describe('failure after the row landed', () => {
  // M5 bites here.
  it('surfaces the failure, re-reads so the DANGLING item appears, and deletes nothing', async () => {
    const err = Object.assign(new Error('הקובץ לא הועלה לענן'), { userSafe: true });
    const { ctx, handler } = harness({ store: { add: vi.fn().mockRejectedValue(err) } });
    await handler(fakeEvent(fakeFile()));
    expect(ctx.toast).toHaveBeenCalledWith('הקובץ לא הועלה לענן', 'error');
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
    expect(ctx.store.remove).toBeUndefined(); // nothing in the seam can clean up
  });

  it('falls back to a truthful generic message when the error is not user-safe', async () => {
    const { ctx, handler } = harness({ store: { add: vi.fn().mockRejectedValue(new Error('TypeError: x')) } });
    await handler(fakeEvent(fakeFile()));
    expect(ctx.toast).toHaveBeenCalledWith(UPLOAD_FAILURE_HE, 'error');
  });

  it('never rejects — a throwing handler would leave the busy guard stuck', async () => {
    const { busyRef, handler } = harness({ store: { add: vi.fn().mockRejectedValue(new Error('x')) } });
    await expect(handler(fakeEvent(fakeFile()))).resolves.toBeUndefined();
    expect(busyRef.current).toBe(false);
  });
});

describe('the double-submit guard', () => {
  // M4 bites here: a useState flag lands one render late and lets two through.
  it('admits exactly one upload while the first is in flight', async () => {
    let release;
    const { ctx, handler } = harness({
      store: { add: vi.fn(() => new Promise((res) => { release = () => res('id'); })) },
    });
    const first = handler(fakeEvent(fakeFile()));
    await handler(fakeEvent(fakeFile())); // fires while the first is pending
    expect(ctx.store.add).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('re-arms after the first upload settles', async () => {
    const { ctx, busyRef, handler } = harness();
    await handler(fakeEvent(fakeFile()));
    expect(busyRef.current).toBe(false);
    await handler(fakeEvent(fakeFile()));
    expect(ctx.store.add).toHaveBeenCalledTimes(2);
  });
});

describe('the input value is reset on EVERY path', () => {
  // Without this, re-picking the same file fires no change event at all.
  const paths = {
    success: {},
    cancel: { file: null },
    mismatch: { readSignature: async () => new Uint8Array(ASSET_SIGNATURE_BYTES).fill(0x2f) },
    failure: { store: { add: vi.fn().mockRejectedValue(new Error('x')) } },
  };
  for (const [name, over] of Object.entries(paths)) {
    it(`resets after ${name}`, async () => {
      const { handler } = harness(over);
      const ev = fakeEvent('file' in over ? over.file : fakeFile());
      await handler(ev);
      expect(ev.target.value).toBe('');
    });
  }

  it('resets even when the handler is refused by the busy guard', async () => {
    const { handler, busyRef } = harness();
    busyRef.current = true;
    const ev = fakeEvent(fakeFile());
    await handler(ev);
    expect(ev.target.value).toBe('');
  });
});

describe('readAssetSignature — never throws, never refuses on its own', () => {
  it('returns null when the file cannot be sliced', async () => {
    expect(await readAssetSignature({})).toBeNull();
    expect(await readAssetSignature(null)).toBeNull();
  });

  it('returns null when the read throws', async () => {
    const bad = { slice: () => ({ arrayBuffer: async () => { throw new Error('read failed'); } }) };
    expect(await readAssetSignature(bad)).toBeNull();
  });

  it('returns the leading bytes when the read works', async () => {
    const good = { slice: () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) };
    expect(Array.from(await readAssetSignature(good))).toEqual([1, 2, 3]);
  });
});

// ===================================================================
// Screen wiring. Source-scanned because this repo renders no components in
// tests — so each scan carries a NEGATIVE control that mutates the REAL file
// and proves the assertion would have failed.
// ===================================================================

const panelGate = (src) => /\{\(gallery\.length > 0 \|\| canUpload\) && \(/.test(src);
const uploadGatedOnDurable = (src) => /const canUpload = Boolean\(galleryStore\.durable\)/.test(src);
const acceptIsDerived = (src) => /accept=\{ASSET_UPLOAD_ACCEPT\}/.test(src);

describe('the gallery panel renders for an empty DURABLE gallery (D3)', () => {
  it('is gated on canUpload as well as the item count', () => {
    expect(panelGate(IMAGE_STUDIO)).toBe(true);
  });

  // M3 bites here.
  it('NEGATIVE: restoring the old count-only gate is reported', () => {
    const mutated = IMAGE_STUDIO.replace('{(gallery.length > 0 || canUpload) && (', '{gallery.length > 0 && (');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(IMAGE_STUDIO);
    expect(panelGate(mutated)).toBe(false);
  });

  it('hides the tab row at zero items instead of showing four "(0)" counts', () => {
    expect(IMAGE_STUDIO).toContain('{gallery.length === 0 ? (');
    expect(IMAGE_STUDIO).toContain('אין עדיין פריטים בגלריה. אפשר להעלות תמונה או ליצור אחת.');
  });
});

describe('upload is a capability of the DURABLE backing only', () => {
  it('is gated on galleryStore.durable, never on the mode', () => {
    expect(uploadGatedOnDurable(IMAGE_STUDIO)).toBe(true);
  });

  // M2 bites here: gating on the mode is exactly what slices 1-3 forbade.
  it('NEGATIVE: gating the upload control on the mode is reported', () => {
    const mutated = IMAGE_STUDIO.replace(
      'const canUpload = Boolean(galleryStore.durable)',
      'const canUpload = Boolean(supabaseEnabled)',
    );
    expect(mutated).not.toBe(IMAGE_STUDIO);
    expect(uploadGatedOnDurable(mutated)).toBe(false);
  });

  it('renders the trigger and the input only inside that gate', () => {
    expect(IMAGE_STUDIO).toContain('{canUpload && (');
    expect(IMAGE_STUDIO).toContain('העלאת תמונה');
  });
});

describe('the file input', () => {
  it('takes its accept value from the derived constant', () => {
    expect(acceptIsDerived(IMAGE_STUDIO)).toBe(true);
  });

  // M1 bites here.
  it('NEGATIVE: a hardcoded image/* accept is reported', () => {
    const mutated = IMAGE_STUDIO.replace('accept={ASSET_UPLOAD_ACCEPT}', 'accept="image/*"');
    expect(mutated).not.toBe(IMAGE_STUDIO);
    expect(acceptIsDerived(mutated)).toBe(false);
  });

  it('is single-file: D1 forbids the multiple attribute on the element itself', () => {
    // Scoped to the ELEMENT, not the file: the word also appears in the comment
    // that explains why the attribute is absent, and a whole-file assertion
    // would pass or fail on prose rather than on markup.
    const start = IMAGE_STUDIO.indexOf('type="file"');
    expect(start, 'no file input found').toBeGreaterThan(-1);
    const element = IMAGE_STUDIO.slice(start, IMAGE_STUDIO.indexOf('/>', start));
    expect(element.replace(/\/\/[^\n]*/g, '')).not.toContain('multiple');
  });

  it('is out of the accessibility tree and off the tab order, with the name on the button', () => {
    expect(IMAGE_STUDIO).toMatch(/type="file"\s+hidden\s+tabIndex=\{-1\}/);
  });
});

describe('scope boundaries this slice must not cross', () => {
  it('does not re-encode the file anywhere on the upload path', () => {
    // srcToBlob belongs to the GENERATION path and must not appear in the
    // handler; a canvas/dataURL round-trip would change the stored bytes.
    const handler = IMAGE_STUDIO.slice(IMAGE_STUDIO.indexOf('createGalleryUploadHandler'));
    const body = handler.slice(0, handler.indexOf('export default'));
    expect(body).not.toContain('srcToBlob');
    expect(body).not.toContain('toDataURL');
  });

  it('does not delete an asset from the upload path', () => {
    const handler = IMAGE_STUDIO.slice(IMAGE_STUDIO.indexOf('export function createGalleryUploadHandler'));
    expect(handler.slice(0, handler.indexOf('export default'))).not.toContain('deleteAsset');
  });

  it('leaves the generation path labelling its own source', () => {
    expect(IMAGE_STUDIO).toContain("const SOURCE_BY_MODE = { text: 'text-to-image' }");
    expect(IMAGE_STUDIO).toContain('galleryMeta(r, SOURCE_BY_MODE[mode]');
  });
});
