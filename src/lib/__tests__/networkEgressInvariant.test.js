// ===================================================================
// NETWORK-EGRESS INVARIANT — the cloud-only claim, structurally + at runtime.
//
// This suite REPLACES the destination-text proof as the load-bearing evidence.
// Codex demonstrated why it had to: a destination assembled at runtime —
// `fetch('http://' + host + ':9000/x')` — never appears as a URL literal, so no
// amount of source-text scanning can see it. That is not a missing pattern; it
// is proof that a source-level proxy cannot decide a runtime property.
//
// The claim is now the CONJUNCTION of two layers, asserted separately below:
//
//   1. RUNTIME — `src/lib/networkPolicy.js` is the real execution boundary.
//      Every approved adapter issues its request through `guardedFetch()`,
//      which normalizes the destination with the platform's WHATWG URL parser
//      and REFUSES loopback / private / link-local / unspecified / IPv4-mapped
//      IPv6 hosts. However the string was built, by then it is concrete.
//
//   2. STRUCTURAL — only the modules in ADAPTER_REGISTRY may contain a network
//      sink at all. Sinks are found in the AST by SHAPE, never by identifier
//      name or URL text, so a new raw `fetch` cannot enter the product and
//      quietly skip layer 1.
//
// Neither layer alone is the proof. Layer 1 without layer 2 is bypassed by
// adding a second sink; layer 2 without layer 1 cannot see an assembled host.
// ===================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectModules, UnparseableSourceError } from './support/sourceScan.js';
import { findNetworkSinks, findNetworkSinksInFile, SINK_KINDS } from './support/networkEgress.js';
import {
  classifyDestination, assertPublicDestination, isForbiddenHost,
} from '../networkPolicy.js';

const isTestPath = (p) => /\.test\.[jt]sx?$/.test(p) || /(^|[\\/])__tests__[\\/]/.test(p);
const productModules = () => collectModules('src').filter((f) => !isTestPath(f));
const norm = (p) => path.normalize(p);

// ── THE REGISTRY ───────────────────────────────────────────────────
// Every product module permitted to hold a network sink, and why. This list is
// the whole allowance: anything not here must contain ZERO sinks. Adding a
// module here is a deliberate, reviewable act — which is exactly the property
// that stops a new raw client wrapper from entering silently.
const ADAPTER_REGISTRY = Object.freeze({
  // THE boundary. The only module in the product allowed to call fetch().
  'src/lib/networkPolicy.js': [SINK_KINDS.FETCH],
  // Image RENDER sites: assigning `.src` makes the browser load a resource.
  // They render blob:/data:/gallery URLs that already passed the boundary when
  // they were fetched. Registered so a NEW one cannot appear unnoticed.
  'src/components/studio/PosterEditor.jsx': [SINK_KINDS.ELEMENT_SRC],
  'src/components/studio/MockupStudio.jsx': [SINK_KINDS.ELEMENT_SRC],
  'src/components/ui/MaskCanvas.jsx': [SINK_KINDS.ELEMENT_SRC],
});

describe('egress · structural containment (AST, not identifier names)', () => {
  it('the sink inventory is real (it finds the boundary itself)', () => {
    const sinks = findNetworkSinksInFile(norm('src/lib/networkPolicy.js'));
    expect(sinks.map((s) => s.kind)).toContain(SINK_KINDS.FETCH);
  });

  it('ONLY registered adapters contain a network sink', () => {
    const offenders = [];
    for (const file of productModules()) {
      const sinks = findNetworkSinksInFile(file);
      if (!sinks.length) continue;
      const key = file.split(path.sep).join('/');
      const allowed = ADAPTER_REGISTRY[key];
      if (!allowed) { offenders.push(`${key} → ${sinks.map((s) => s.kind).join(',')}`); continue; }
      for (const s of sinks) {
        if (!allowed.includes(s.kind)) offenders.push(`${key}:${s.line} → unregistered sink ${s.kind}`);
      }
    }
    expect(offenders, `unapproved network egress: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('every registered adapter still exists and still holds the sink it was registered for', () => {
    for (const [file, kinds] of Object.entries(ADAPTER_REGISTRY)) {
      expect(fs.existsSync(file), `registry names a missing file: ${file}`).toBe(true);
      const found = findNetworkSinksInFile(norm(file)).map((s) => s.kind);
      for (const k of kinds) expect(found, `${file} no longer holds ${k}`).toContain(k);
    }
  });

  it('exactly ONE product module may call fetch — the policy boundary', () => {
    const holders = productModules()
      .filter((f) => findNetworkSinksInFile(f).some((s) => s.kind === SINK_KINDS.FETCH))
      .map((f) => f.split(path.sep).join('/'));
    expect(holders).toEqual(['src/lib/networkPolicy.js']);
  });

  it('unparseable product source fails LOUDLY during sink discovery', () => {
    expect(() => findNetworkSinks('const = = ;', 'broken.js')).toThrow(UnparseableSourceError);
  });
});

describe('egress · a NEW raw sink is caught regardless of identifier names', () => {
  // Detection is by AST shape. Renaming things, aliasing globals or hiding the
  // call behind an innocuous-looking helper changes nothing.
  const DISGUISES = [
    ["export async function loadThing(u){ return fetch(u); }", SINK_KINDS.FETCH, 'plain fetch'],
    ["export const send = (u) => window.fetch(u);", SINK_KINDS.FETCH, 'window.fetch'],
    ["export const send = (u) => globalThis.fetch(u);", SINK_KINDS.FETCH, 'globalThis.fetch'],
    ["const cloudTransport = fetch; export const go = (u) => cloudTransport(u);", SINK_KINDS.FETCH, 'aliased into a friendly name'],
    ["export function ping(u){ const x = new XMLHttpRequest(); x.open('GET', u); x.send(); }", SINK_KINDS.XHR, 'XMLHttpRequest'],
    ["export const live = (u) => new WebSocket(u);", SINK_KINDS.WEBSOCKET, 'WebSocket'],
    ["export const stream = (u) => new EventSource(u);", SINK_KINDS.EVENT_SOURCE, 'EventSource'],
    ["export const tell = (u,d) => navigator.sendBeacon(u,d);", SINK_KINDS.BEACON, 'sendBeacon'],
    ["export const spawn = (u) => new Worker(u);", SINK_KINDS.WORKER, 'Worker'],
    ["export const load = (u) => import(u);", SINK_KINDS.DYNAMIC_IMPORT, 'dynamic import of a variable'],
    ["export const show = (el,u) => { el.src = u; };", SINK_KINDS.ELEMENT_SRC, 'element.src assignment'],
  ];

  it.each(DISGUISES)('finds a sink in: %s', (source, kind) => {
    const sinks = findNetworkSinks(source, 'newModule.js');
    expect(sinks.map((s) => s.kind), source).toContain(kind);
  });

  it('a new unapproved module holding a sink FAILS the registry check', () => {
    // Simulates the exact regression the invariant exists to stop: someone adds
    // `src/lib/telemetryClient.js` with its own fetch. It is not in the
    // registry, so the containment assertion must reject it.
    const candidate = 'src/lib/telemetryClient.js';
    const sinks = findNetworkSinks("export const post = (u,b) => fetch(u,{method:'POST',body:b});", candidate);
    expect(sinks.length).toBeGreaterThan(0);
    expect(Object.keys(ADAPTER_REGISTRY)).not.toContain(candidate);
  });

  it('a module with no sink is not falsely accused', () => {
    for (const src of [
      'export const add = (a,b) => a + b;',
      "export const url = 'https://api.example.com/v1';",           // a string is not a sink
      'export const f = { fetch: 1 }; export const g = f.fetch;',   // a PROPERTY named fetch
      'export function fetchClients(state){ return state.clients; }', // a function NAMED fetch*
      "export const img = <img src={u} alt='' />;",                 // JSX prop, not an assignment
    ]) {
      expect(findNetworkSinks(src, 'clean.jsx'), src).toEqual([]);
    }
  });
});

describe('egress · runtime boundary rejects assembled private destinations (Codex P1)', () => {
  // THE BYPASS: the destination is built at runtime, so it never exists as a
  // literal for any text scanner to find. The execution boundary sees it anyway.
  const host = '127.0.0.1';
  const lanHost = '10.0.0.5';
  const port = 9000;

  const ASSEMBLED = [
    ['string concatenation', 'http://' + host + ':' + port + '/x'],
    ['template substitution', `http://${host}:${port}/x`],
    ['host and port both variable', `http://${lanHost}:${port}/x`],
    ['host from an object field', `http://${{ h: '192.168.1.9' }.h}:${port}/x`],
    ['host from an array join', `http://${['169', '254', '1', '2'].join('.')}:${port}/x`],
    ['scheme concatenated', `${'ht' + 'tp'}://${host}:${port}/x`],
    ['IPv4-mapped IPv6, assembled', `http://[::ffff:${host}]:${port}/x`],
  ];

  it.each(ASSEMBLED)('refuses a destination built by %s', (_label, url) => {
    const verdict = classifyDestination(url);
    expect(verdict.ok, `${url} was allowed`).toBe(false);
    expect(verdict.reason).toBe('private_destination');
    expect(() => assertPublicDestination(url)).toThrow();
  });

  it('the thrown error is business-facing and names no internal detail', () => {
    let caught;
    try { assertPublicDestination(`http://${host}:${port}/x`); } catch (e) { caught = e; }
    expect(caught).toBeTruthy();
    expect(caught.userSafe || caught.userMessage).toBeTruthy();
    for (const leak of ['127.0.0.1', 'private_destination', 'fetch', 'policy']) {
      expect(String(caught.message), leak).not.toContain(leak);
    }
  });

  it('guardedFetch refuses before issuing any request', async () => {
    const { guardedFetch } = await import('../networkPolicy.js');
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = (...a) => { calls.push(a); return Promise.resolve({ ok: true }); };
    try {
      await expect(async () => guardedFetch(`http://${host}:${port}/x`)).rejects.toBeTruthy();
      expect(calls, 'a request was issued despite the refusal').toEqual([]);
    } finally { globalThis.fetch = original; }
  });
});

describe('egress · IPv4-mapped IPv6 classification (Codex P1)', () => {
  const MAPPED_FORBIDDEN = [
    ['[::ffff:127.0.0.1]', 'mapped loopback, dotted'],
    ['[::ffff:7f00:1]', 'mapped loopback, normalized hex'],
    ['[::ffff:192.168.1.5]', 'mapped RFC1918'],
    ['[::ffff:c0a8:105]', 'mapped RFC1918, hex'],
    ['[::ffff:10.0.0.5]', 'mapped 10/8'],
    ['[::ffff:169.254.1.2]', 'mapped link-local'],
    ['[::ffff:172.16.0.1]', 'mapped 172.16/12'],
  ];
  it.each(MAPPED_FORBIDDEN)('rejects %s (%s)', (host) => {
    expect(isForbiddenHost(host), host).toBe(true);
    expect(classifyDestination(`http://${host}:9000/x`).ok, host).toBe(false);
  });

  const MAPPED_PUBLIC = [
    ['[::ffff:8.8.8.8]', 'mapped PUBLIC IPv4'],
    ['[::ffff:808:808]', 'mapped PUBLIC IPv4, hex'],
    ['[2606:4700::1]', 'ordinary global IPv6'],
  ];
  it.each(MAPPED_PUBLIC)('allows %s (%s)', (host) => {
    expect(isForbiddenHost(host), host).toBe(false);
    expect(classifyDestination(`https://${host}/x`).ok, host).toBe(true);
  });
});

describe('egress · approved cloud traffic still works', () => {
  const ALLOWED = [
    'https://weciwurjfwmqihcyexzj.supabase.co/functions/v1/ai-gateway',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    'https://gen.pollinations.ai/image/prompt?model=flux',
    'https://r.jina.ai/https://example.com',
    'https://fonts.googleapis.com/css2?family=Heebo',
    'data:image/jpeg;base64,AAAA',
    'blob:http://localhost:4188/9f0e-uuid',
  ];
  it.each(ALLOWED)('allows %s', (url) => {
    expect(classifyDestination(url).ok, url).toBe(true);
  });

  it('blob: and data: are allowed as NON-EGRESS, not as public hosts', () => {
    expect(classifyDestination('data:text/plain,hi').reason).toBe('non_egress_scheme');
    // ...even though the blob URL's origin text mentions localhost
    expect(classifyDestination('blob:http://localhost:4188/x').reason).toBe('non_egress_scheme');
  });

  it('fails CLOSED on an unresolvable or unsupported destination', () => {
    for (const bad of ['', 'not a url', 'file:///etc/passwd', 'javascript:alert(1)', '   ']) {
      expect(classifyDestination(bad).ok, bad).toBe(false);
    }
  });

  it('business data that merely looks like an IP is out of scope entirely', () => {
    // The boundary classifies DESTINATIONS handed to it. A version string or an
    // SKU is never handed to it, and nothing here turns data into a request.
    for (const v of ['10.0.0.1', '192.168.1.50-BLUE', '172.16', '12:30', '2130706433']) {
      // Not a URL → refused if someone DID try to fetch it, and never reached
      // otherwise. Either way it cannot become a silent private request.
      expect(classifyDestination(v).ok, v).toBe(false);
    }
  });
});
