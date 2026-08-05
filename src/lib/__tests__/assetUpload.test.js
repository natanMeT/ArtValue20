import { describe, it, expect } from 'vitest';
import {
  ASSET_SOURCE_UPLOAD, ASSET_UPLOAD_ACCEPT, ASSET_SIGNATURE_BYTES,
  ASSET_MIME_ALLOWLIST, ASSET_META_LIMITS,
  assetSignatureVerdict, uploadMeta,
} from '../assetLibrary.js';

// ===================================================================
// Asset Library slice 4 — the PURE half of user file upload.
//
// Everything here is advisory-by-design. The server owns every rule these
// helpers mirror, and the signature check owns NO server rule at all: it is a
// truthfulness guard, not a security boundary, and it does not close the
// declared L3 (the server validates the DECLARED Content-Type, not bytes).
// ===================================================================

// Build the first ASSET_SIGNATURE_BYTES bytes: a real header, then filler.
const header = (...bytes) => {
  const out = new Uint8Array(ASSET_SIGNATURE_BYTES);
  bytes.forEach((b, i) => { out[i] = b; });
  return out;
};
const PNG = header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = header(0xff, 0xd8, 0xff, 0xe0);
const WEBP = (() => {
  const b = header(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00);
  b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50; // 'WEBP'
  return b;
})();

describe('the upload source label', () => {
  it('is exactly the string the column stores', () => {
    expect(ASSET_SOURCE_UPLOAD).toBe('upload');
  });

  // The label and the cap live in different halves of assetLibrary.js, so the
  // relationship is asserted rather than assumed. `source` is bounded at 40 by
  // assets_meta_bounded; a longer label would be TRUNCATED by sanitizeAssetMeta
  // and the provenance would silently stop being 'upload'.
  it('fits the server-side source cap', () => {
    expect(ASSET_SOURCE_UPLOAD.length).toBeLessThanOrEqual(ASSET_META_LIMITS.source);
  });
});

describe('the <input accept> value', () => {
  // M1 bites here: a hardcoded literal is a fourth copy of a rule that already
  // has three synchronized ones.
  it('is DERIVED from the MIME allowlist, not written out by hand', () => {
    expect(ASSET_UPLOAD_ACCEPT).toBe(ASSET_MIME_ALLOWLIST.join(','));
  });

  it('never widens to a wildcard — the allowlist is three exact types', () => {
    expect(ASSET_UPLOAD_ACCEPT).not.toContain('*');
    expect(ASSET_UPLOAD_ACCEPT.split(',')).toHaveLength(3);
  });
});

describe('assetSignatureVerdict — POSITIVE controls', () => {
  it('accepts a real PNG header declared as image/png', () => {
    expect(assetSignatureVerdict('image/png', PNG)).toBe('match');
  });

  it('accepts a real JPEG header declared as image/jpeg', () => {
    expect(assetSignatureVerdict('image/jpeg', JPEG)).toBe('match');
  });

  it('accepts a real WebP header declared as image/webp', () => {
    expect(assetSignatureVerdict('image/webp', WEBP)).toBe('match');
  });

  it('is case-insensitive about the declared MIME', () => {
    expect(assetSignatureVerdict('IMAGE/PNG', PNG)).toBe('match');
  });
});

describe('assetSignatureVerdict — MISMATCH (the case the guard exists for)', () => {
  it('reports a PNG body declared as JPEG', () => {
    expect(assetSignatureVerdict('image/jpeg', PNG)).toBe('mismatch');
  });

  it('reports a renamed text file declared as PNG', () => {
    // 'hello world!' — the .txt-renamed-to-.png case from the QA plan.
    const text = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21]);
    expect(assetSignatureVerdict('image/png', text)).toBe('mismatch');
  });

  it('requires BOTH halves of a WebP header — RIFF alone is also AVI and WAV', () => {
    const riffOnly = header(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00);
    riffOnly[8] = 0x41; riffOnly[9] = 0x56; riffOnly[10] = 0x49; riffOnly[11] = 0x20; // 'AVI '
    expect(assetSignatureVerdict('image/webp', riffOnly)).toBe('mismatch');
  });
});

describe('assetSignatureVerdict — UNREADABLE proceeds, it does not refuse', () => {
  // M6 bites here. An advisory check that failed CLOSED would become a gate the
  // server never agreed to, and would refuse valid files on any slice() quirk.
  it('returns unreadable for fewer bytes than a signature needs', () => {
    expect(assetSignatureVerdict('image/png', new Uint8Array([0x89, 0x50]))).toBe('unreadable');
  });

  it('returns unreadable when the read produced nothing', () => {
    expect(assetSignatureVerdict('image/png', null)).toBe('unreadable');
    expect(assetSignatureVerdict('image/png', undefined)).toBe('unreadable');
  });

  it('returns unreadable for a MIME outside the allowlist — that refusal is validateAssetUpload\'s to make', () => {
    expect(assetSignatureVerdict('application/pdf', PNG)).toBe('unreadable');
    expect(assetSignatureVerdict('', PNG)).toBe('unreadable');
  });

  it('returns unreadable for a non-array-like value instead of throwing', () => {
    expect(assetSignatureVerdict('image/png', {})).toBe('unreadable');
  });
});

describe('uploadMeta — what an uploaded asset records, and what it must NOT', () => {
  // M7 bites here.
  it('carries the source and NOTHING else', () => {
    expect(uploadMeta()).toEqual({ source: 'upload' });
  });

  it('omits engine — the generation path defaults it to "local", which would be a false provenance', () => {
    expect(uploadMeta()).not.toHaveProperty('engine');
  });

  it('omits prompt and preset — the user typed no prompt for this file', () => {
    expect(uploadMeta()).not.toHaveProperty('prompt');
    expect(uploadMeta()).not.toHaveProperty('preset');
  });

  it('omits kind — the cloud row hardcodes kind=image and the server CHECKs it', () => {
    expect(uploadMeta()).not.toHaveProperty('kind');
  });

  it('returns a fresh object each call, so one upload cannot mutate the next', () => {
    const a = uploadMeta();
    a.source = 'tampered';
    expect(uploadMeta().source).toBe('upload');
  });
});
