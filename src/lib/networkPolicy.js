// ===================================================================
// networkPolicy — THE execution boundary for outbound network destinations.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): ArtValue is a CLOUD-ONLY
// product. Until now that claim rested on scanning source text for URL-shaped
// literals. Codex demonstrated that this cannot hold: a destination assembled
// at runtime —
//
//     const host = '127.0.0.1';
//     fetch('http://' + host + ':9000/x');
//     fetch(`http://${host}:9000/x`);
//
// — never appears as a URL literal anywhere in the source, so no text scan can
// see it. A source-level proxy cannot prove a runtime property.
//
// So the invariant moved to where the property actually lives: THE MOMENT THE
// REQUEST IS ISSUED. Every approved adapter routes its request through
// `guardedFetch()` here, which normalizes the destination with the platform's
// WHATWG `URL` parser — the same algorithm the browser will use — and REFUSES
// loopback, private, link-local, unspecified and IPv4-mapped-IPv6 hosts. The
// string can be built any way at all; by the time it reaches this function it
// is a concrete destination, and concrete destinations are decidable.
//
// WHAT THIS DOES NOT DO. It does not replace the structural proof; it completes
// it. The AST/import invariant (see the retirement proof) forbids any product
// module outside the registered adapters from holding a network sink at all,
// so a new raw `fetch` cannot quietly appear and skip this boundary. Runtime
// validation + structural containment together are the claim; neither alone is.
//
// FAIL CLOSED. An unparseable or un-normalizable destination is REJECTED, not
// waved through. Non-network schemes that cannot leave the device (`data:`,
// `blob:`) are allowed by name, because they are not egress.
// ===================================================================

import { userError } from './userFacingError.js';

/** Schemes that carry no off-device egress: inline or in-memory only. */
const NON_EGRESS_SCHEMES = new Set(['data:', 'blob:']);

/** Schemes we are willing to issue a real network request on. */
const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);

const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Is this dotted-quad IPv4 a destination the product must never reach? */
function isForbiddenV4(a, b, c, d) {
  if ([a, b, c, d].some((o) => o > 255)) return true; // malformed → fail closed
  if (a === 127) return true;                          // loopback      127.0.0.0/8
  if (a === 10) return true;                           // private       10.0.0.0/8
  if (a === 192 && b === 168) return true;             // private       192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true;    // private       172.16.0.0/12
  if (a === 169 && b === 254) return true;             // link-local    169.254.0.0/16
  // ONLY the unspecified address itself, never the whole 0.0.0.0/8. Widening it
  // makes the URL parser's normalization of an ordinary `h:mm` clock string
  // (`12:30` → host `0.0.0.12`) look like a private destination, which breaks
  // the business-data boundary this policy must preserve.
  if (a === 0 && b === 0 && c === 0 && d === 0) return true;
  return false;
}

/** Expand a normalized IPv6 hostname into eight 16-bit groups, or null. */
function ipv6Groups(hostname) {
  const inner = String(hostname).replace(/^\[|\]$/g, '');
  if (!inner.includes(':')) return null;
  const [head, tail = ''] = inner.split('::');
  const split = (t) => (t ? t.split(':').filter((x) => x !== '') : []);
  const a = split(head);
  const b = split(tail);
  // A trailing dotted-quad (`::ffff:127.0.0.1`) expands to two groups.
  const expand = (parts) => parts.flatMap((p) => {
    if (!p.includes('.')) return [parseInt(p, 16)];
    const m = V4_RE.exec(p);
    if (!m) return [NaN];
    const [w, x, y, z] = m.slice(1).map(Number);
    return [(w << 8) | x, (y << 8) | z];
  });
  const ea = expand(a);
  const eb = expand(b);
  const fill = inner.includes('::') ? Array(8 - ea.length - eb.length).fill(0) : [];
  const all = [...ea, ...fill, ...eb];
  if (all.length !== 8 || all.some((x) => !Number.isFinite(x))) return null;
  return all;
}

/**
 * Is this NORMALIZED hostname a destination the cloud-only product must never
 * reach? Classification is NUMERIC, so it holds for every textual form the URL
 * parser accepts — shorthand, decimal, hexadecimal, octal, compressed IPv6 and
 * IPv4-mapped IPv6 alike.
 */
export function isForbiddenHost(hostname) {
  // An empty string is not a HOST, so this predicate answers "no". Failing
  // CLOSED on a missing host is `classifyDestination`'s job — it rejects an
  // unparseable or host-less destination before any request is issued. Keeping
  // the two separate stops a bare `'https://'` text fragment (which is not a
  // destination at all) from being reported as a private address.
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  const v4 = V4_RE.exec(h);
  if (v4) return isForbiddenV4(...v4.slice(1).map(Number));

  const g = ipv6Groups(h);
  if (g) {
    // IPv4-mapped (::ffff:0:0/96) and the deprecated IPv4-compatible (::/96)
    // forms embed a real IPv4 address; classify the EMBEDDED address rather
    // than treating the whole thing as an ordinary global IPv6 host.
    const firstFiveZero = g.slice(0, 5).every((x) => x === 0);
    if (firstFiveZero && (g[5] === 0xffff || g[5] === 0)) {
      const embedded = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
      if (g[5] === 0xffff) return isForbiddenV4(...embedded);
      // ::/96 — ::1 and :: are handled below; anything else is IPv4-compatible
      if (g[6] !== 0 || g[7] > 1) return isForbiddenV4(...embedded);
    }
    if (g.every((x, i) => (i < 7 ? x === 0 : x === 1))) return true; // ::1
    if (g.every((x) => x === 0)) return true;                        // ::
    if ((g[0] & 0xffc0) === 0xfe80) return true;                     // fe80::/10
    if ((g[0] & 0xfe00) === 0xfc00) return true;                     // fc00::/7
    return false;
  }

  // A named host (api.example.com) is a public destination. DNS could of course
  // resolve it to a private address; that is a network-layer property this
  // boundary cannot decide, and it is disclosed rather than implied.
  return false;
}

/**
 * Classify a destination. Never throws.
 * @returns {{ ok: boolean, reason: string, href: string, hostname: string }}
 */
export function classifyDestination(input, base = undefined) {
  const raw = typeof input === 'string' ? input : (input && input.url) || String(input || '');
  if (!raw) return { ok: false, reason: 'empty_destination', href: '', hostname: '' };

  let url;
  try {
    url = new URL(raw, base ?? defaultBase());
  } catch {
    return { ok: false, reason: 'unparseable_destination', href: raw, hostname: '' };
  }

  if (NON_EGRESS_SCHEMES.has(url.protocol)) {
    return { ok: true, reason: 'non_egress_scheme', href: url.href, hostname: '' };
  }
  if (!NETWORK_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: 'unsupported_scheme', href: url.href, hostname: url.hostname };
  }
  // A network scheme with no host is not a destination we can classify — fail
  // closed here rather than in the host predicate (see isForbiddenHost).
  if (!url.hostname) {
    return { ok: false, reason: 'no_host', href: url.href, hostname: '' };
  }
  if (isForbiddenHost(url.hostname)) {
    return { ok: false, reason: 'private_destination', href: url.href, hostname: url.hostname };
  }
  return { ok: true, reason: 'public_destination', href: url.href, hostname: url.hostname };
}

// Same-origin relative URLs resolve against the page. In a non-DOM context
// (tests, SSR) there is no origin, so a relative URL cannot be resolved and
// classification fails closed.
function defaultBase() {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.href) {
      return window.location.href;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Assert a destination is allowed, or throw a business-facing error.
 * @returns {string} the NORMALIZED href actually approved
 */
export function assertPublicDestination(input, base = undefined) {
  const verdict = classifyDestination(input, base);
  if (verdict.ok) return verdict.href;
  // The user never sees which class failed — only that the address is refused.
  const err = userError('הכתובת אינה נתמכת. ניתן להשתמש רק בכתובות אינטרנט ציבוריות.');
  err.destinationReason = verdict.reason;
  throw err;
}

/**
 * THE approved network sink. Every registered cloud adapter issues its request
 * through this function, so every destination — however it was assembled — is
 * normalized and classified before a request leaves the app.
 */
export function guardedFetch(input, init = undefined) {
  const href = assertPublicDestination(input);
  return fetch(href, init);
}

export default guardedFetch;
