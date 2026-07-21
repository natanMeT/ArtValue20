// ===================================================================
// M2 J3C S4.1 — studio.generate_image: server-side image Gateway action.
//
// Focused pins for the new backend-only image lane:
//   vocabulary/routing/cost, strict input contract, pure Interactions
//   request builder, strict single-PNG response parser (fail-closed),
//   adapter security (one attempt, no retry/fallback, no key/raw-body
//   leak), shell lifecycle order, and content-free usage accounting.
// NO live provider call is ever made: fetch is stubbed with documented
// response shapes; no real image bytes or credentials appear anywhere.
// ===================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  AI_ACTION_TYPES,
  COST_TIER_BY_ACTION,
  DEFAULT_PROVIDER_BY_ACTION,
  selectProvider,
  estimateCost,
  buildAiRequest,
} from '../../_shared/aiGateway.js';
import {
  GEMINI_IMAGE_ACTION_TYPES,
  GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES,
  isGeminiImageExecutableAction,
  isGeminiExecutableAction,
  GEMINI_TEXT_ACTION_TYPES,
  GEMINI_IMAGE_MAX_DECODED_BYTES,
  AI_GATEWAY_IMAGE_ASPECT_RATIOS,
  AI_GATEWAY_INPUT_LIMITS,
  validateAiGatewayInput,
  buildGeminiImageInteractionRequest,
  parseGeminiImageInteractionResponse,
  decodedBase64Bytes,
  buildProviderImageSuccessResponse,
  buildAiGatewayDecision,
  buildUsageRecord,
} from '../../_shared/aiGatewayContract.js';
import { getActionProfile } from '../actionProfiles.ts';
import {
  runGeminiImage,
  GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_TIMEOUT_MS,
  isGatewayImageAction,
  REQUIRED_IMAGE_ACTION_KEYS,
  GEMINI_IMAGE_DIAGNOSTIC_CODES,
  classifyGeminiImageHttpStatus,
  classifyGeminiImageThrown,
} from '../geminiImageAdapter.ts';

const ACTION = 'studio.generate_image';
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const adapterSrc = read('../geminiImageAdapter.ts');
const indexSrc = read('../index.ts');

// A tiny VALID canonical base64 payload (decodes to 6 bytes) — no real image.
const B64 = 'AAAAAAAA';
const okInteraction = () => ({
  steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: B64 }] }],
});
const validPayload = () => ({ prompt: 'משרד מודרני עם תאורה טבעית', aspectRatio: '1:1' });
const decisionFor = (payload = validPayload()) => buildAiGatewayDecision({ actionType: ACTION, payload });
const profile = getActionProfile(ACTION);

// ---------------------------------------------------------------
// 1) Vocabulary, routing, capability and profile completeness
// ---------------------------------------------------------------
describe('S4.1 · vocabulary + routing + cost', () => {
  it('the action is canonical, image-executable, gemini-only, and NOT a text action', () => {
    expect(AI_ACTION_TYPES.includes(ACTION)).toBe(true);
    expect([...GEMINI_IMAGE_ACTION_TYPES]).toEqual([ACTION]);
    expect([...GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES]).toEqual([ACTION]);
    expect(Object.isFrozen(GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES)).toBe(true);
    expect(isGeminiImageExecutableAction(ACTION)).toBe(true);
    expect(isGeminiImageExecutableAction('image.poster')).toBe(false);
    // text policy untouched: the image action never enters the text sets
    expect(GEMINI_TEXT_ACTION_TYPES.includes(ACTION)).toBe(false);
    expect(isGeminiExecutableAction(ACTION)).toBe(false);
    // single-provider chain — no second provider can ever be consulted
    expect(DEFAULT_PROVIDER_BY_ACTION[ACTION]).toEqual(['gemini']);
    expect(selectProvider(ACTION)).toEqual(['gemini']);
  });

  it('cost classification + pinned per-image reservation ($0.07, isExact:false)', () => {
    expect(COST_TIER_BY_ACTION[ACTION]).toBe('medium_high');
    const est = estimateCost(ACTION, 'gemini');
    expect(est.estimatedCost).toBe(0.07);
    expect(est.isExact).toBe(false);
    expect(est.currency).toBe('USD');
    // the routing decision carries the same server-owned reservation
    expect(decisionFor().routing.costEstimate.estimatedCost).toBe(0.07);
    expect(buildAiRequest(ACTION).requiresBudgetCheck).toBe(true);
    // no other action's estimate drifted (tier arithmetic unchanged)
    expect(estimateCost('text.copy', 'gemini').estimatedCost).toBe(0.002);
    expect(estimateCost('image.poster', 'openai').estimatedCost).toBe(0.03);
    expect(estimateCost('image.product_lock', 'openai').estimatedCost).toBe(0.1);
  });

  it('server-owned profile: image output, PNG, 1K — and the adapter drift guard accepts exactly it', () => {
    expect(profile).not.toBe(null);
    expect(profile.outputMode).toBe('image');
    expect(profile.imageMimeType).toBe('image/png');
    expect(profile.imageSize).toBe('1K');
    expect(Object.isFrozen(profile)).toBe(true);
    expect(isGatewayImageAction(ACTION, profile)).toBe(true);
    expect(isGatewayImageAction(ACTION, { outputMode: 'text' })).toBe(false);
    expect(isGatewayImageAction('text.copy', profile)).toBe(false);
    expect([...REQUIRED_IMAGE_ACTION_KEYS]).toEqual([ACTION]);
  });
});

// ---------------------------------------------------------------
// 2) Strict input contract
// ---------------------------------------------------------------
describe('S4.1 · strict input validation', () => {
  it('accepts exactly { prompt, aspectRatio } and normalizes (trimmed prompt; ratio verbatim)', () => {
    const r = validateAiGatewayInput(ACTION, { prompt: '  a modern office  ', aspectRatio: '16:9' });
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({ prompt: 'a modern office', aspectRatio: '16:9' });
    // enum values are content-free: inputChars counts the prompt only
    expect(r.inputChars).toBe('a modern office'.length);
  });

  it('the aspect-ratio enum is EXACTLY the official supported set (frozen, case-sensitive)', () => {
    expect([...AI_GATEWAY_IMAGE_ASPECT_RATIOS]).toEqual(
      ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    );
    expect(Object.isFrozen(AI_GATEWAY_IMAGE_ASPECT_RATIOS)).toBe(true);
    for (const ratio of AI_GATEWAY_IMAGE_ASPECT_RATIOS) {
      expect(validateAiGatewayInput(ACTION, { prompt: 'p', aspectRatio: ratio }).ok, ratio).toBe(true);
    }
    for (const bad of ['1:2', '1:1 ', ' 1:1', '1:1\n', 'square', '16:10', '', '9:21', 1, null, undefined, ['1:1']]) {
      expect(validateAiGatewayInput(ACTION, { prompt: 'p', aspectRatio: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('empty/whitespace prompts and missing keys reject', () => {
    expect(validateAiGatewayInput(ACTION, { prompt: '', aspectRatio: '1:1' }).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, { prompt: '   \n\t ', aspectRatio: '1:1' }).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, { aspectRatio: '1:1' }).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, { prompt: 'p' }).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, {}).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, null).ok).toBe(false);
    expect(validateAiGatewayInput(ACTION, []).ok).toBe(false);
  });

  it('prompt boundary: 2000 accepted, 2001 rejected (never truncated)', () => {
    expect(AI_GATEWAY_INPUT_LIMITS.MAX_IMAGE_PROMPT_CHARS).toBe(2000);
    const at = validateAiGatewayInput(ACTION, { prompt: 'x'.repeat(2000), aspectRatio: '1:1' });
    expect(at.ok).toBe(true);
    expect(at.payload.prompt.length).toBe(2000);
    expect(validateAiGatewayInput(ACTION, { prompt: 'x'.repeat(2001), aspectRatio: '1:1' }).ok).toBe(false);
  });

  it('unknown keys and every authority field reject the whole payload', () => {
    const authority = [
      'provider', 'model', 'imageSize', 'image_size', 'resolution', 'count', 'n',
      'endpoint', 'apiKey', 'api_key', 'key', 'headers', 'responseFormat',
      'response_format', 'temperature', 'retry', 'fallback', 'safety',
      'safetySettings', 'mimeType', 'mime_type', 'width', 'height',
    ];
    for (const k of authority) {
      const r = validateAiGatewayInput(ACTION, { ...validPayload(), [k]: 'x' });
      expect(r.ok, k).toBe(false);
    }
  });
});

// ---------------------------------------------------------------
// 3) Pure Interactions request builder
// ---------------------------------------------------------------
describe('S4.1 · Interactions request builder (pure)', () => {
  it('builds the exact documented body — server-owned type/MIME/size, no model/key/endpoint', () => {
    const r = buildGeminiImageInteractionRequest(validPayload(), profile);
    expect(r.ok).toBe(true);
    expect(r.body).toEqual({
      input: 'משרד מודרני עם תאורה טבעית',
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '1:1', image_size: '1K' },
    });
    // S4.1a: `input` is the official text-only shape — the trimmed prompt
    // STRING itself, never a content-block array or object.
    expect(typeof r.body.input).toBe('string');
    expect(Array.isArray(r.body.input)).toBe(false);
    // model/endpoint/key ownership stays in the adapter (house pattern)
    expect(JSON.stringify(r.body).includes('gemini-3.1')).toBe(false);
    expect(JSON.stringify(r.body).includes('http')).toBe(false);
  });

  it('trims the prompt into `input` (string in, string out)', () => {
    const r = buildGeminiImageInteractionRequest({ prompt: '  a modern office  ', aspectRatio: '16:9' }, profile);
    expect(r.ok).toBe(true);
    expect(r.body.input).toBe('a modern office');
  });

  it('fails closed on blank prompt / unsupported ratio (before any provider work)', () => {
    expect(buildGeminiImageInteractionRequest({ prompt: '', aspectRatio: '1:1' }, profile).ok).toBe(false);
    expect(buildGeminiImageInteractionRequest({ prompt: 'p', aspectRatio: 'huge' }, profile).ok).toBe(false);
    expect(buildGeminiImageInteractionRequest(null, profile).ok).toBe(false);
  });
});

// ---------------------------------------------------------------
// 4) Strict single-PNG response parser (fail-closed)
// ---------------------------------------------------------------
describe('S4.1 · response parser (fail-closed)', () => {
  it('decodedBase64Bytes: canonical arithmetic, strict rejection', () => {
    expect(decodedBase64Bytes('AAAA')).toBe(3);
    expect(decodedBase64Bytes('AAA=')).toBe(2);
    expect(decodedBase64Bytes('AA==')).toBe(1);
    for (const bad of ['', 'A', 'AAAAA', 'AA=A', '!!!!', 'AAAA ', null, 5]) {
      expect(decodedBase64Bytes(bad), String(bad)).toBe(null);
    }
  });

  it('accepts exactly one valid image/png block from steps (interleaved text tolerated)', () => {
    const withText = {
      steps: [{
        type: 'model_output',
        content: [
          { type: 'text', text: 'here you go' },
          { type: 'image', mime_type: 'image/png', data: B64 },
        ],
      }],
    };
    const img = parseGeminiImageInteractionResponse(withText);
    expect(img).toEqual({ mimeType: 'image/png', base64: B64, decodedBytes: 6 });
  });

  it('accepts the output_image convenience shape when no steps exist (mimeType variant too)', () => {
    expect(parseGeminiImageInteractionResponse({ output_image: { mime_type: 'image/png', data: B64 } }))
      .toEqual({ mimeType: 'image/png', base64: B64, decodedBytes: 6 });
    expect(parseGeminiImageInteractionResponse({ output_image: { mimeType: 'image/png', data: B64 } }))
      .toEqual({ mimeType: 'image/png', base64: B64, decodedBytes: 6 });
  });

  it('rejects: wrong MIME, invalid base64, empty image, multiple images, text-only, oversized, unsafe keys, junk', () => {
    const block = (over = {}) => ({
      steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: B64, ...over }] }],
    });
    expect(parseGeminiImageInteractionResponse(block({ mime_type: 'image/jpeg' }))).toBe(null);
    expect(parseGeminiImageInteractionResponse(block({ data: 'not base64!!' }))).toBe(null);
    expect(parseGeminiImageInteractionResponse(block({ data: '' }))).toBe(null);
    expect(parseGeminiImageInteractionResponse({
      steps: [{
        type: 'model_output',
        content: [
          { type: 'image', mime_type: 'image/png', data: B64 },
          { type: 'image', mime_type: 'image/png', data: B64 },
        ],
      }],
    })).toBe(null);
    expect(parseGeminiImageInteractionResponse({
      steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no image, sorry' }] }],
    })).toBe(null);
    // oversized: cap is enforced via option (arithmetic, no giant string needed)
    expect(parseGeminiImageInteractionResponse(okInteraction(), { maxDecodedBytes: 5 })).toBe(null);
    expect(GEMINI_IMAGE_MAX_DECODED_BYTES).toBe(8 * 1024 * 1024);
    // unsafe keys anywhere → null
    const evil = okInteraction();
    Object.defineProperty(evil.steps[0].content[0], '__proto__', { value: {}, enumerable: true });
    expect(parseGeminiImageInteractionResponse(evil)).toBe(null);
    // junk shapes
    for (const junk of [null, 'x', [], {}, { steps: 'x' }, { steps: [] }, { output_image: 'x' }]) {
      expect(parseGeminiImageInteractionResponse(junk)).toBe(null);
    }
  });

  it('success envelope carries ONLY { image: { mimeType, base64 } } in result', () => {
    const d = decisionFor();
    const out = buildProviderImageSuccessResponse(d, { mimeType: 'image/png', base64: B64, decodedBytes: 6 });
    expect(out.ok).toBe(true);
    expect(out.provider).toBe('gemini');
    expect(out.execution).toEqual({ status: 'completed' });
    expect(out.result).toEqual({ image: { mimeType: 'image/png', base64: B64 } });
    expect(out.usage).toEqual({ logging: 'active', budgetCheck: 'approved' });
  });
});

// ---------------------------------------------------------------
// 5) Adapter behavior (mocked provider — NO live call, no real key)
// ---------------------------------------------------------------
describe('S4.1 · image adapter (mocked fetch)', () => {
  const KEY = 'test-key-never-real';
  beforeEach(() => {
    vi.stubGlobal('Deno', { env: { get: (k) => (k === 'GEMINI_API_KEY' ? KEY : undefined) } });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const okFetch = () => ({ ok: true, status: 200, json: async () => okInteraction() });

  it('no key → 503 provider_not_configured with ZERO fetches', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    const r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('provider_not_configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('success: exactly ONE fetch to the exact documented endpoint/headers/body; key only in header', async () => {
    fetch.mockResolvedValue(okFetch());
    const d = decisionFor();
    d.request.payload = validateAiGatewayInput(ACTION, validPayload()).payload;
    const r = await runGeminiImage(d, profile);
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual({ image: { mimeType: 'image/png', base64: B64 } });
    expect(r.resultChars).toBe(B64.length);
    // S4.1a: success carries NO diagnostic code
    expect(r.diagnosticCode ?? null).toBe(null);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(url.includes(KEY)).toBe(false); // never in the URL
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': KEY });
    expect(JSON.parse(init.body)).toEqual({
      model: 'gemini-3.1-flash-image',
      input: 'משרד מודרני עם תאורה טבעית',
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '1:1', image_size: '1K' },
    });
    expect(typeof JSON.parse(init.body).input).toBe('string');
    expect(GEMINI_IMAGE_MODEL).toBe('gemini-3.1-flash-image');
    expect(GEMINI_IMAGE_TIMEOUT_MS).toBe(60000);
  });

  it('provider 4xx/5xx → 502 provider_error; ONE attempt; body never read into the response', async () => {
    for (const status of [400, 403, 429, 500, 503]) {
      fetch.mockReset();
      fetch.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'SECRET-UPSTREAM' }), text: async () => 'SECRET-UPSTREAM' });
      const r = await runGeminiImage(decisionFor(), profile);
      expect(r.status, status).toBe(502);
      expect(r.body.error.code).toBe('provider_error');
      expect(JSON.stringify(r.body).includes('SECRET-UPSTREAM')).toBe(false);
      expect(JSON.stringify(r.body).includes(KEY)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1); // no retry
    }
  });

  it('thrown fetch / timeout-abort → 502 provider_error, one attempt, no key leak', async () => {
    const abort = new Error('The signal has been aborted');
    abort.name = 'TimeoutError';
    fetch.mockRejectedValue(abort);
    const r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('provider_error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('malformed JSON / invalid image shapes → 502 (provider_error / invalid_provider_response)', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    let r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('provider_error');

    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'only text' }] }] }) });
    r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('invalid_provider_response');
  });

  it('wrong/missing profile (drift) → 502 with ZERO fetches; invalid payload → 400 with ZERO fetches', async () => {
    fetch.mockResolvedValue(okFetch());
    let r = await runGeminiImage(decisionFor(), getActionProfile('text.copy'));
    expect(r.status).toBe(502);
    r = await runGeminiImage(decisionFor(), null);
    expect(r.status).toBe(502);
    const d = decisionFor();
    d.request.payload = { prompt: '', aspectRatio: '1:1' };
    r = await runGeminiImage(d, profile);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('invalid_payload');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// 6) Shell lifecycle + source purity (source pins)
// ---------------------------------------------------------------
describe('S4.1 · shell wiring + source purity', () => {
  it('index.ts image branch preserves auth → validation → budget → ONE provider call order', () => {
    const branch = indexSrc.slice(indexSrc.indexOf('IMAGE lane (M2 J3C S4.1)'));
    const iValidate = branch.indexOf('validateAiGatewayInput');
    const iReserve = branch.indexOf('reserveAiBudget');
    const iRun = branch.indexOf('runGeminiImage(decision, profile)');
    expect(iValidate).toBeGreaterThan(-1);
    expect(iReserve).toBeGreaterThan(iValidate);
    expect(iRun).toBeGreaterThan(iReserve);
    // exactly ONE runGeminiImage call site in the whole shell (the import
    // names it without parentheses)
    expect(indexSrc.match(/runGeminiImage\(/g).length).toBe(1);
  });

  it('the text branch and its registry stay byte-compatible (image lane bypasses the text registry)', () => {
    expect(indexSrc.includes("executionRegistry.register(geminiAdapter)")).toBe(true);
    expect(indexSrc.includes('isGeminiExecutableAction(decision.actionType)')).toBe(true);
    // the image branch never registers into / selects from the text registry
    const branch = indexSrc.slice(indexSrc.indexOf('IMAGE lane (M2 J3C S4.1)'));
    expect(branch.includes('executionRegistry')).toBe(false);
  });

  it('adapter source purity: server env only, no browser/local/other-provider surface, no retry loop', () => {
    // comment-stripped: doc comments legitimately SAY "no retry/no fallback"
    const code = adapterSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const banned of [
      'VITE_GEMINI_API_KEY', 'VITE_POLLINATIONS_TOKEN', 'import.meta.env',
      'localhost', '127.0.0.1', 'ComfyUI', 'comfyui', 'pollinations', 'Pollinations',
      'for (', 'while (', 'retry', 'fallbackProvider',
    ]) {
      expect(code.includes(banned), banned).toBe(false);
    }
    expect(code.includes("Deno.env.get('GEMINI_API_KEY')")).toBe(true);
    expect(code.match(/fetch\(/g).length).toBe(1); // exactly one fetch site
    // key never concatenated into a URL/template
    expect(code.includes('key=')).toBe(false);
    expect(code.includes('${apiKey}')).toBe(false);
  });

  it('S4.1a: shell passes diagnosticCode ONLY to recordUsage — never into the client response', () => {
    const branch = indexSrc.slice(indexSrc.indexOf('IMAGE lane (M2 J3C S4.1)'));
    // destructured from the adapter and consumed inside the recordUsage call…
    expect(branch.includes('diagnosticCode')).toBe(true);
    // …while the client return is the untouched adapter body
    expect(branch.includes('return json(out, status)')).toBe(true);
    // the diagnostic seat is the EXISTING errorCode field — no new usage field
    expect(branch.includes('diagnosticData')).toBe(false);
    expect(branch.includes('metadata')).toBe(false);
    // the contract's public response builders know nothing about diagnostics
    const contractSrc = read('../../_shared/aiGatewayContract.js');
    expect(contractSrc.includes('diagnosticCode')).toBe(false);
  });

  it('content-free ai_usage: existing fields only; pinned estimate; counts never content', () => {
    const d = decisionFor();
    const rec = buildUsageRecord({
      requestId: 'r', userId: '123e4567-e89b-12d3-a456-426614174000', decision: d,
      provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: 'completed', httpStatus: 200,
      promptChars: 26, resultChars: B64.length,
    });
    expect(rec.action_type).toBe(ACTION);
    expect(rec.provider).toBe('gemini');
    expect(rec.model).toBe('gemini-3.1-flash-image');
    expect(rec.cost_tier).toBe('medium_high');
    expect(rec.estimated_cost_usd).toBe(0.07);
    expect(rec.is_estimate).toBe(true);
    expect(rec.prompt_chars).toBe(26);
    expect(rec.result_chars).toBe(B64.length);
    // no content fields exist in the record
    const keys = Object.keys(rec);
    for (const banned of ['prompt', 'text', 'base64', 'image', 'body', 'response']) {
      expect(keys.includes(banned), banned).toBe(false);
    }
  });
});

// ---------------------------------------------------------------
// 7) S4.1a — content-free upstream diagnostics (allowlist + purity)
// ---------------------------------------------------------------
describe('S4.1a · diagnostic allowlist + classifiers (pure)', () => {
  it('the allowlist is EXACTLY the approved closed set (frozen)', () => {
    expect([...GEMINI_IMAGE_DIAGNOSTIC_CODES]).toEqual([
      'provider_http_400', 'provider_http_401', 'provider_http_403',
      'provider_http_404', 'provider_http_408', 'provider_http_409',
      'provider_http_429', 'provider_http_5xx', 'provider_http_other',
      'provider_timeout', 'provider_transport_error',
      'provider_malformed_json', 'invalid_provider_response',
    ]);
    expect(Object.isFrozen(GEMINI_IMAGE_DIAGNOSTIC_CODES)).toBe(true);
  });

  it('HTTP classification: known statuses 1:1; other 5xx collapse; everything else → other', () => {
    expect(classifyGeminiImageHttpStatus(400)).toBe('provider_http_400');
    expect(classifyGeminiImageHttpStatus(401)).toBe('provider_http_401');
    expect(classifyGeminiImageHttpStatus(403)).toBe('provider_http_403');
    expect(classifyGeminiImageHttpStatus(404)).toBe('provider_http_404');
    expect(classifyGeminiImageHttpStatus(408)).toBe('provider_http_408');
    expect(classifyGeminiImageHttpStatus(409)).toBe('provider_http_409');
    expect(classifyGeminiImageHttpStatus(429)).toBe('provider_http_429');
    for (const s of [500, 502, 503, 504, 599]) {
      expect(classifyGeminiImageHttpStatus(s), s).toBe('provider_http_5xx');
    }
    for (const s of [402, 405, 410, 418, 451, 499, 600, 302, 100, NaN, null, undefined, 'x']) {
      expect(classifyGeminiImageHttpStatus(s), String(s)).toBe('provider_http_other');
    }
    // every classifier output is a member of the closed allowlist
    for (const s of [400, 401, 403, 404, 408, 409, 429, 500, 302]) {
      expect(GEMINI_IMAGE_DIAGNOSTIC_CODES.includes(classifyGeminiImageHttpStatus(s))).toBe(true);
    }
  });

  it('thrown classification: Abort/Timeout names → provider_timeout; anything else → provider_transport_error', () => {
    const timeout = new Error('x'); timeout.name = 'TimeoutError';
    const abort = new Error('x'); abort.name = 'AbortError';
    expect(classifyGeminiImageThrown(timeout)).toBe('provider_timeout');
    expect(classifyGeminiImageThrown(abort)).toBe('provider_timeout');
    expect(classifyGeminiImageThrown(new TypeError('fetch failed'))).toBe('provider_transport_error');
    expect(classifyGeminiImageThrown(new Error('ECONNRESET'))).toBe('provider_transport_error');
    expect(classifyGeminiImageThrown('not-an-error')).toBe('provider_transport_error');
    expect(classifyGeminiImageThrown(null)).toBe('provider_transport_error');
  });
});

describe('S4.1a · adapter diagnostics (mocked fetch) — internal only, public body generic', () => {
  const KEY = 'test-key-never-real';
  const CANARY = 'CANARY-9f3e-UPSTREAM-SECRET-DO-NOT-LEAK';
  beforeEach(() => {
    vi.stubGlobal('Deno', { env: { get: (k) => (k === 'GEMINI_API_KEY' ? KEY : undefined) } });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('every mapped HTTP status yields its allowlisted diagnostic; public body stays generic; ONE attempt each', async () => {
    const cases = [
      [400, 'provider_http_400'], [401, 'provider_http_401'], [403, 'provider_http_403'],
      [404, 'provider_http_404'], [408, 'provider_http_408'], [409, 'provider_http_409'],
      [429, 'provider_http_429'], [500, 'provider_http_5xx'], [502, 'provider_http_5xx'],
      [503, 'provider_http_5xx'], [418, 'provider_http_other'],
    ];
    for (const [status, expected] of cases) {
      fetch.mockReset();
      fetch.mockResolvedValue({ ok: false, status, json: async () => ({ error: CANARY }), text: async () => CANARY });
      const r = await runGeminiImage(decisionFor(), profile);
      expect(r.status, status).toBe(502);
      expect(r.body.error.code, status).toBe('provider_error');
      expect(r.diagnosticCode, status).toBe(expected);
      // the diagnostic never rides inside the client body
      expect(JSON.stringify(r.body).includes(expected)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1); // no retry per classification
    }
  });

  it('timeout-abort → provider_timeout; other thrown fetch → provider_transport_error (generic 502 both)', async () => {
    const abort = new Error('The signal has been aborted');
    abort.name = 'TimeoutError';
    fetch.mockRejectedValue(abort);
    let r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('provider_error');
    expect(r.diagnosticCode).toBe('provider_timeout');

    fetch.mockReset();
    fetch.mockRejectedValue(new TypeError('fetch failed'));
    r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('provider_error');
    expect(r.diagnosticCode).toBe('provider_transport_error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('2xx + malformed JSON → provider_malformed_json; 2xx + schema-invalid image → invalid_provider_response', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    let r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('provider_error');
    expect(r.diagnosticCode).toBe('provider_malformed_json');

    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'only text' }] }] }) });
    r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('invalid_provider_response');
    expect(r.diagnosticCode).toBe('invalid_provider_response');
  });

  it('pre-provider local failures carry NO upstream diagnostic (no key / drift / invalid payload)', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    let r = await runGeminiImage(decisionFor(), profile);
    expect(r.status).toBe(503);
    expect(r.diagnosticCode ?? null).toBe(null);

    vi.stubGlobal('Deno', { env: { get: (k) => (k === 'GEMINI_API_KEY' ? KEY : undefined) } });
    r = await runGeminiImage(decisionFor(), null);
    expect(r.status).toBe(502);
    expect(r.diagnosticCode ?? null).toBe(null);

    const d = decisionFor();
    d.request.payload = { prompt: '', aspectRatio: '1:1' };
    r = await runGeminiImage(d, profile);
    expect(r.status).toBe(400);
    expect(r.diagnosticCode ?? null).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sensitive canary in the provider error body appears NOWHERE: response, diagnostic, usage record, logs, serialized return', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: CANARY } }), text: async () => CANARY });
      const r = await runGeminiImage(decisionFor(), profile);
      // full serialized adapter return — nothing carries the canary or the key
      const serialized = JSON.stringify(r);
      expect(serialized.includes(CANARY)).toBe(false);
      expect(serialized.includes(KEY)).toBe(false);
      // diagnostic is a fixed allowlist member, not derived from upstream data
      expect(GEMINI_IMAGE_DIAGNOSTIC_CODES.includes(r.diagnosticCode)).toBe(true);
      // usage record built from the diagnostic stays content-free
      const rec = buildUsageRecord({
        requestId: 'r', userId: '123e4567-e89b-12d3-a456-426614174000', decision: decisionFor(),
        provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: 'provider_error', httpStatus: 502,
        errorCode: r.diagnosticCode, promptChars: 5, resultChars: null,
      });
      expect(JSON.stringify(rec).includes(CANARY)).toBe(false);
      expect(rec.error_code).toBe('provider_http_5xx');
      // every console.error argument is canary-free and key-free
      for (const call of errorSpy.mock.calls) {
        const line = call.map(String).join(' ');
        expect(line.includes(CANARY)).toBe(false);
        expect(line.includes(KEY)).toBe(false);
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('S4.1a · usage persistence seat (existing error_code field only)', () => {
  it('each allowlisted diagnostic persists verbatim through buildUsageRecord.error_code — no new field', () => {
    for (const code of GEMINI_IMAGE_DIAGNOSTIC_CODES) {
      const rec = buildUsageRecord({
        requestId: 'r', userId: '123e4567-e89b-12d3-a456-426614174000', decision: decisionFor(),
        provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: 'provider_error', httpStatus: 502,
        errorCode: code, promptChars: 5, resultChars: null,
      });
      expect(rec.error_code, code).toBe(code);
      // record shape is UNCHANGED — the existing columns only
      expect(Object.keys(rec).sort()).toEqual([
        'action_type', 'cost_tier', 'error_code', 'estimated_cost_usd', 'http_status',
        'is_estimate', 'model', 'prompt_chars', 'provider', 'request_id',
        'result_chars', 'status', 'user_id',
      ]);
      // cost accounting stays the pinned content-free estimate
      expect(rec.estimated_cost_usd).toBe(0.07);
      expect(rec.prompt_chars).toBe(5);
      expect(rec.result_chars).toBe(null);
    }
  });

  it('successful image outcome records NO diagnostic (error_code null)', () => {
    const rec = buildUsageRecord({
      requestId: 'r', userId: '123e4567-e89b-12d3-a456-426614174000', decision: decisionFor(),
      provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: 'completed', httpStatus: 200,
      errorCode: null, promptChars: 26, resultChars: B64.length,
    });
    expect(rec.error_code).toBe(null);
    expect(rec.result_chars).toBe(B64.length);
  });
});
