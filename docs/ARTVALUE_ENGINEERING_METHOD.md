# ArtValue Engineering Method

## 1. Purpose

This document defines the working discipline for **any agent** (Claude, Fable, or other model) working on ArtValue20 — Jake OS, Business Brain, Decision Engine, Execution Planner, Handoff Resolver, Studio handoff, Product Lock, the AI Gateway (router, contract, Edge Function), and everything that follows (server-side providers, usage/cost controls, multi-tenant organizations).

The repo is built slice by slice, each slice reviewed by an external advisor (ChatGPT) from a numbered brief. The method exists so every slice — audit, implementation, review, verification, or docs — is **scoped, evidenced, self-attacked, verified, and reported** the same way, regardless of which model runs it.

One architecture principle governs everything downstream of Jake:

> **Users name the action they want, never the AI provider or model.**
> User-facing: "create a poster", "write a follow-up", "build a campaign".
> Internal: `image.poster`, `text.crm_message`, `text.campaign`.
> Provider/model selection lives behind the AI Gateway / server boundary — never in UI, never in user input, never as trusted request fields.

## 2. Core Loop: Scope → Evidence → Attack → Verify → Report

Every task, no exceptions:

1. **Scope** — pin down exactly what this slice is and is not, before touching anything.
2. **Evidence** — establish current state from real files and commands, not from memory.
3. **Attack** — try to break your own plan/diff before anyone else does.
4. **Verify** — prove the result with tests, diffs, and guardrail checks.
5. **Report** — return only the requested brief, in the requested format.

If any step fails, stop and report — do not push through.

## 3. Task Types

Every prompt declares (or implies) exactly one type. Identify it first; it determines what you may do.

| Type | May edit files | May commit/push | May merge | May deploy |
|---|---|---|---|---|
| **Audit** | never | never | never | never |
| **Implementation** | allowed-list only | yes (prescribed message) | **never** unless explicitly instructed | never |
| **Review / Merge Review** | never (findings only) | never | only on explicit "MERGE APPROVED" | never |
| **Post-merge verification** | never | never (ff-pull only) | n/a | never |
| **Docs-only** | listed docs only | yes | never unless instructed | never |
| **Deploy-only** | per prompt | per prompt | never | only as explicitly instructed; account-bound steps are user-executed |

If a prompt mixes types, treat the strictest interpretation as binding and flag the ambiguity in the brief.

## 4. Universal Preflight Checklist

Before any work:

1. `git branch --show-current` — confirm the expected branch (usually `main`).
2. `git rev-parse HEAD` — confirm it **equals the hash stated in the prompt**. Mismatch → stop and report.
3. `git status --porcelain` — clean except known untracked `dist-profile/`. Anything else → stop and report.
4. Read the allowed-files list and the do-not-touch list. If a file you believe is necessary is not on the allowed list — **stop and report before changing it.**
5. Confirm what is explicitly out of scope (usually: next slice, deploy, secrets, wiring).
6. For implementation: create the prescribed branch `feat/<name>` and rollback tag `pre-<name>` before editing.

## 5. Audit Method

- Read-only. Inspection commands only (`git`, `rg`/grep, file reads, `npm test` for baseline at most).
- Answer the prompt's questions **from file contents and command output**, each claim traceable to something you actually read or ran this session.
- Prior briefs, memory files, and compact summaries are context for *where to look* — they are never proof. Re-verify anything you assert.
- Evaluate the architectural options the prompt lists; recommend one with reasons; name exact allowed files for the next slice.
- End with a readiness verdict (READY FOR IMPLEMENTATION PROMPT: YES/NO) and the copy-back section.

## 6. Implementation Method

1. Preflight (§4), branch, rollback tag.
2. Touch **only** allowed files. New files must be on the allowed list too.
3. Follow the house pattern for pure modules: deterministic, node-testable, `Object.freeze` vocabularies, never-throws on hostile input, safe fallbacks, **no** `window` / `fetch` / `localStorage` / `sessionStorage` / `Date.now` / `Math.random` / crypto-random ids / `process.env` / `import.meta.env` / `Deno.env` in pure code.
4. Match surrounding style (comment density, header blocks, Hebrew UI labels where applicable, test structure mirroring existing suites).
5. Write/extend tests in the same slice: behavior, hostile inputs, determinism, source-purity, and guardrail pins.
6. Run `npm test` (full suite) — must be green before staging.
7. Stage explicitly by exact path. Commit with the prescribed message. Push. **Do not merge.**

## 7. Self-review / Attack Method

Before staging, actively try to invalidate your own work:

- **Scope creep** — does the diff contain anything the prompt didn't ask for? (`git diff --name-only` vs. the allowed list.)
- **Frozen files** — did any protected file change, even by formatting? (§15.)
- **Key exposure** — any secret, `VITE_*` provider var, provider domain, or key-shaped string in code, tests, or docs?
- **Hidden execution** — could anything auto-generate, auto-call a provider, or run without an explicit user CTA?
- **Hidden navigation** — could anything navigate without an explicit user click?
- **Persistence risks** — do prompt payloads leak into URLs, `localStorage`/`sessionStorage`, or persisted chat? Are transient messages excluded from save/hydrate?
- **Deploy/runtime risks** — does the change assume tooling (Deno, Supabase CLI) or runtime behavior not verified in this environment? Say so explicitly rather than implying it works.
- **Next-slice bleed** — does this slice quietly begin the next one (a provider call "for testing", a client stub, an env var "for later")? Remove it.
- **Test honesty** — do new tests actually pin the behavior, or would they pass on a broken implementation? Did a test get weakened to make it pass?

Anything found here is fixed or reported — never silently shipped.

## 8. Verification Method

After implementation, before reporting:

1. `npm test` — full suite green. Report the exact counts.
2. `git diff --name-only main...HEAD` — exactly the allowed files, nothing more.
3. Forbidden-file scan — confirm no protected file appears in the diff.
4. `git status --short` — clean except untracked `dist-profile/`.
5. No broad staging occurred (never `git add -A`; every `git add` names exact paths).
6. Source-purity and guardrail tests pass where relevant (they are part of the suite; call them out in the brief).
7. Where the repo defines it, run `npm run local:review-prep -- --no-model` and report the verdict.
8. Browser QA only when the change is user-visible **and** port 5173 is free; if the user's dev server occupies 5173, report and skip — never kill it.

## 9. Post-merge Method

Post-merge verification is read-only except the ff-pull:

1. `git checkout main` && `git pull --ff-only origin main`.
2. Report the final main hash; confirm the feature commit is an ancestor (`git branch --contains <hash>` or `git merge-base --is-ancestor`).
3. `git diff --name-only <previous-main>...HEAD` — exactly the expected files.
4. Forbidden-file scan on that diff.
5. Full `npm test` on merged main.
6. `git status --short` — clean except `dist-profile/`.
7. Branch cleanup **only if the prompt instructs it** (local `git branch -d`; remote delete only when explicitly told). Rollback tags are retained.
8. Return the COMPACT POST-MERGE BRIEF — nothing else.

## 10. Reporting Method for ChatGPT Advisor

- Return **only** the brief named in the prompt, using its exact numbered structure.
- Every numbered item gets an answer — "none"/"n/a" is an answer; silence is not.
- No large logs; quote only the lines that prove the point (test summary line, hash, file list).
- Distinguish clearly: **verified** (ran/read it this session) vs. **expected** (documented but not executed here — e.g., Deno not installed).
- Blockers and risks are stated plainly, separated into *blocking* and *non-blocking*.
- The copy-back section is short and paste-ready (§18).

## 11. Git Rules

- Verify the starting hash against the prompt before branching. Mismatch → stop.
- Branch names and rollback tags exactly as prescribed (`feat/<name>`, `pre-<name>`).
- **Never `git add -A`.** Stage files explicitly by exact path, every time.
- **Never commit `dist-profile/`.** It stays untracked.
- Commit messages exactly as prescribed by the slice prompt.
- Push the feature branch; give the compare URL (`https://github.com/natanMeT/ArtValue20/compare/main...<branch>`). gh CLI is not assumed.
- **Never merge unless explicitly instructed** ("MERGE APPROVED" or equivalent). Merges are `--no-ff` with the prescribed message, or performed by the user via PR.
- **Never deploy unless explicitly instructed**, and account-bound steps (login/link/deploy/secrets) are user-executed — the agent never holds credentials.
- Never rewrite history, never force-push, never delete rollback tags.

## 12. Scope Control Rules

- **Audit before implementation.** No implementation without a preceding approved audit or an explicit implementation prompt.
- **One slice at a time.** Finish, report, wait.
- **Do not broaden the task** — no drive-by refactors, no formatting sweeps, no "while I'm here" fixes. Out-of-scope findings go in the brief's notes (or a spawned task suggestion), not in the diff.
- **Do not start the next slice**, even when it is obvious. Recommending it in the brief is welcome; writing its code is not.
- If the prompt's allowed-files list seems wrong or insufficient — stop and report; never improvise scope.

## 13. Security and AI Provider Rules

- **No `VITE_*` provider secrets — ever again.** `VITE_*` values are baked into the public bundle. (`VITE_GEMINI_API_KEY` is a known legacy exception; it is rotated only after server-side parity, in its own authorized slice.)
- **No API keys in frontend code, tests, docs, or transcripts.** Placeholders only (`<ANON_KEY>`, `<PROJECT_REF>`).
- Future provider secrets live **only** in Supabase Edge Function secrets (`supabase secrets set NAME=...`), read via `Deno.env.get()` in the function shell — never in pure `_shared` modules, never in the repo.
- `.env` and `.env.example` are modified only when a slice explicitly authorizes it.
- Dependencies / `package.json` are modified only when a slice explicitly authorizes it.
- `supabase/config.toml` is not created or modified unless the slice explicitly authorizes it; if a CLI step demands it, stop and report.
- Provider execution (OpenAI/Gemini/Anthropic/Replicate/etc.) is added only when a slice explicitly instructs it, behind the gateway boundary, fail-closed when unconfigured.
- Callers request **action types** (`text.copy`, `image.poster`, …), never providers/models; provider/model fields arriving from untrusted input are stripped, and hints (e.g., `preferredProvider`) may only reorder an already-validated chain.

## 14. Jake / Studio / AI Gateway Safety Rules

These invariants hold in every slice, always:

- **No auto-navigation.** Navigation happens only behind an explicit user click (click-bound `navigate`, never effects).
- **No auto-generation.** Generation runs only behind the Studio CTA (or an equivalent explicit user action). Handoffs *prefill*; they never generate.
- **No prompt payloads in URLs.** Handoff payloads travel via in-memory router state or equivalent, never query strings.
- **No prompt payloads in `localStorage`/`sessionStorage`.**
- **No prompt payloads in persisted chat.** Transient cards/messages (handoff, progress, critique) are stripped before save and never rehydrated.
- **Confirm-mode remains the sole action gate** for Jake actions — propose → confirm → execute; nothing executes without the confirm step.
- The AI Gateway router and contract stay **pure and deterministic** (node-testable, frozen vocabularies, never-throws); the Edge Function stays a thin shell delegating to them.
- Local providers (ComfyUI, Ollama, Fooocus, A1111) remain registered as dev/fallback providers — nothing local is deleted or disabled by gateway work.
- Product Lock's pixel-preservation contract (product pixels 1:1, `grow_mask_by: 0` paste-back) must never be weakened.

## 15. Frozen Files and Protected Areas

Frozen unless a slice **explicitly authorizes** a minimal exception (additive-only where noted):

- `src/components/ai/Assistant.jsx`
- `src/lib/jakePack.js`
- `src/lib/jakeAgent.js`
- `src/lib/gemini.js`
- `src/lib/geminiImage.js` (additive-only when authorized)
- `src/pages/ImageStudio.jsx`
- Product Lock files
- Growth pages (`src/pages/growth/**`, `src/components/growth/**`)
- `src/App.jsx`
- Sidebar / routes (`src/components/layout/Sidebar.jsx`)
- `package.json`
- `.env`
- `creative/v2/**` (including the never-import-`offer/` rule)

Additional standing protections:

- `dist-profile/` — **never staged, never committed**, never modified.
- `supabase/config.toml` — not created or modified unless the slice explicitly authorizes it.
- API provider secrets — never added to frontend env, in any form.
- `supabase/functions/_shared/` — canonical pure gateway modules; `src/lib/aiGateway.js` and `src/lib/aiGatewayContract.js` are re-export shims. Moving the canonicals breaks the shims (shim-proof tests guard this) — treat relocation as its own authorized slice.

## 16. Standard Return Formats

Use the exact structure the prompt requests. When it doesn't specify one, use these:

### 16.1 CHATGPT REVIEW BRIEF — AUDIT

```
CHATGPT REVIEW BRIEF — <SLICE NAME> AUDIT
1. Repo / main verification (branch, HEAD, matches expected: yes/no, tree, known untracked)
2. Current state (what exists / what does not / relevant files)
3. Findings (per the prompt's questions, numbered, evidence-based)
4. Option analysis + recommendation (when options were given)
5. Recommended next slice (name, goal, exact allowed files, do-not-touch)
6. Required tests / verification for that slice
7. Risks / blockers (blocking vs non-blocking)
8. READY FOR IMPLEMENTATION PROMPT: YES/NO (+ prerequisites if NO)
9. Copy-back section for ChatGPT
```

### 16.2 CHATGPT REVIEW BRIEF — IMPLEMENTATION

```
CHATGPT REVIEW BRIEF — <SLICE NAME> IMPLEMENTATION
1. Repo / branch verification (starting hash, branch, rollback tag, tree before/after)
2. Files changed (exact list; no forbidden files; dist-profile untouched)
3. Implementation summary (what each file does; what stayed deferred)
4. Behavior details (per the prompt's contract)
5. Tests (command, result, counts, notable additions)
6. Guardrails (each one: yes/no)
7. Risks / non-blocking notes
8. Git (commit hash, pushed yes/no, compare URL, merge status: not merged)
9. READY FOR MERGE REVIEW: YES/NO
10. Copy-back section for ChatGPT
```

### 16.3 COMPACT POST-MERGE BRIEF

```
COMPACT POST-MERGE BRIEF — <SLICE NAME>
1. Main verification (branch, final hash, previous hash, feature merged yes/no)
2. Exact files merged (list; unexpected: yes/no)
3. Tests (command, result, counts)
4. Guardrails (each: yes/no)
5. Working tree status
6. Branch cleanup (only if instructed)
7. POST-MERGE GREEN: YES/NO (+ blockers)
8. Copy-back section for ChatGPT
```

### 16.4 COPY-BACK SECTION FOR CHATGPT

Always short and paste-ready. Provide **only**:

- what changed
- tests result (one summary line)
- exact files changed
- risks/blockers
- readiness: yes/no
- final main hash (post-merge briefs only)
- next recommended slice **only if asked**

## 17. Red Flags That Must Stop Work

Stop immediately and report — do not proceed, do not work around:

- HEAD does not match the hash stated in the prompt.
- Working tree is dirty beyond untracked `dist-profile/` at preflight.
- A needed change falls outside the allowed-files list.
- A frozen/protected file would have to change.
- A CLI or tool wants to create/modify `supabase/config.toml` or other config out of scope.
- Any step would require an API key, secret, or credential the agent would have to hold.
- Tests fail and the "fix" would weaken a test or guardrail.
- The task as written would auto-generate, auto-navigate, persist prompt payloads, or bypass confirm-mode.
- The slice would effectively start the next slice.
- A destructive git operation (force-push, history rewrite, tag deletion, deleting a branch not authorized for cleanup) appears necessary.
- Port 5173 would need to be freed — never kill the user's processes; skip browser QA instead and say so.

Stopping with a clear report is success, not failure.

## 18. Copy-back Discipline

The user shuttles briefs between the agent and the ChatGPT advisor. Respect that loop:

- Return **only** the requested brief — no preamble, no epilogue, no extra sections.
- Keep the copy-back section within the limits of §16.4; the advisor asks follow-ups if it wants more.
- Never bury a blocker inside prose — blockers appear in their own labeled line.
- Never claim an unverified step as done. "Not run — tooling absent (non-blocking, manual step)" is the honest form.
- If the prompt's requested format and this document ever conflict, **the prompt wins** — this method is the default, not an override.
