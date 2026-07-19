// ===================================================================
// Slice 0 (M2 · Option C) — public Jake demo-copy guard.
//
// The demoChat fallback reaches END USERS on hosted production (no browser
// provider key by design). Its copy must therefore be public-safe:
//   - never mention API keys, AI keys, env files, or technical configuration;
//   - never instruct the user to configure the system;
//   - stay calm and truthful (Gateway drafting still works, so it must not
//     claim that all AI features are unavailable).
//
// Source-scan guard (same house pattern as the other contract tests): pins the
// approved public copy and bans key/env-instruction phrases from the demoChat
// body, WITHOUT touching demo detection, delays, signatures, or routing.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Normalize EOLs so the extraction below works on both LF and CRLF checkouts.
const SRC = readFileSync(fileURLToPath(new URL('../gemini.js', import.meta.url)), 'utf8')
  .replace(/\r\n/g, '\n');

// Extract the demoChat function body (from its declaration to its top-level
// closing brace) so the bans target the PUBLIC chat copy specifically.
function demoChatBody() {
  const start = SRC.indexOf('function demoChat(');
  expect(start).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const end = rest.indexOf('\n}\n');
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end + 2);
}

const APPROVED_COPY = 'היי, אני ג׳ייק 🙂 כרגע השיחה החכמה המלאה אינה זמינה. '
  + 'אפשר להמשיך להשתמש בפעולות הניסוח והכלים הזמינים במערכת, או לנסות שוב מאוחר יותר.';

describe('Jake public demo copy (Slice 0)', () => {
  it('demoChat resolves exactly the approved public-safe message', () => {
    expect(demoChatBody().includes(APPROVED_COPY)).toBe(true);
  });

  it('demoChat copy contains no key/env/configuration instruction', () => {
    const body = demoChatBody();
    for (const banned of [
      'מפתח AI', 'מפתח API', '.env', 'API key', 'api key', 'AI key',
      'הוסיפו מפתח', 'הוסף מפתח', 'הגדר', 'קונפיגורציה', 'environment',
    ]) {
      expect(body.includes(banned), `demoChat must not contain "${banned}"`).toBe(false);
    }
  });

  it('demoChat keeps its behavioral contract: (history) signature, Promise, 700ms delay', () => {
    const body = demoChatBody();
    expect(body.includes('function demoChat(history)')).toBe(true);
    expect(body.includes('new Promise')).toBe(true);
    expect(body.includes('700')).toBe(true);
  });

  it('the old misleading key/.env phrasing exists nowhere in gemini.js', () => {
    for (const banned of ['הוסיפו מפתח AI', 'ללא מפתח AI', 'מפתח AI ב-.env']) {
      expect(SRC.includes(banned), `gemini.js must not contain "${banned}"`).toBe(false);
    }
  });
});
