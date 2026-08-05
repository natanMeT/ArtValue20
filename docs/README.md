# ArtValue — Canonical Product Documentation

This directory is the shared source of truth for ArtValue product documentation, hosted on GitHub (`natanMeT/ArtValue20`). It replaces ad-hoc `.docx` handoffs and Claude-memory copies as the authoritative record.

## Authoritative Markdown files

The following **three Markdown files are authoritative**. They are the live source of truth; edit these and review the diff.

| File | Role | Current version |
| --- | --- | --- |
| [`PROJECT_TRACKER.md`](PROJECT_TRACKER.md) | Living cross-session handoff — **the single source of truth for live release state** (source, deployment, bundle, Edge version, rollback target), plus the status ledger and open decisions. | — (living) |
| [`roadmaps/BUSINESS_OS_MASTER_ROADMAP.md`](roadmaps/BUSINESS_OS_MASTER_ROADMAP.md) | Product **strategy** — vision, modules, customer journey, launch gates, risks. **The product vision lives here, in §1.1–§1.5** (what ArtValue is, what it is not, who it is for). There is no separate vision file: one was added and removed the same day once it was confirmed to duplicate those sections. | **Business OS v0.11** |
| [`roadmaps/AI_GATEWAY_MASTER_ROADMAP.md`](roadmaps/AI_GATEWAY_MASTER_ROADMAP.md) | AI infrastructure **strategy** — Gateway contracts, milestones, decision log. | **AI Gateway v5.6** |

### One state document, not four

**Only `PROJECT_TRACKER.md` states what is live.** Both roadmaps are kept separate on purpose — product and infrastructure are two domains with different audiences — but neither carries release identifiers. They record what an earlier slice *did* (that is the release history and it stays), and for anything about today they point at the tracker: *מצב השחרור החי — ראה `docs/PROJECT_TRACKER.md`*.

The reason is measured, not stylistic: the same deployment ID used to live in four documents, only one was updated per release, and the roadmaps on `main` drifted across **three** consecutive releases — one naming a production anchor three releases old. Duplication, not carelessness, was the cause. A second copy of a state identifier is a defect.

## Word exports — generated on demand, not stored

**No `.docx` files are kept in git.** The Word exports are generated from the canonical Markdown when a distributable copy is actually needed, and they are not committed.

Eight exports (Business OS v0.7–v0.10, AI Gateway v5.3–v5.6) previously lived under `docs/releases/`. They are removed: every one of them was a frozen copy of the Markdown **including the release-state identifiers of the day it was exported**, so each was a competing stale state document the moment the next release shipped — read by a human, in Word, with nothing to indicate it was superseded. Git history retains them if an exact old export is ever needed.

Regenerating one is a documentation-only task: export the current Markdown to Hebrew-RTL `.docx`, hand over the file, do not commit it.

**Version numbering note:** the Business OS roadmap advanced v0.10 → **v0.11** (and earlier v0.9 → v0.10), deliberately not v1.0 — it remains a pre-beta strategic draft with durable Asset Library, durable Campaigns, module durability, organization boundaries and credits/cost controls still open. A v1.0 label would falsely signal launch readiness.

## Update policy

- Update documentation **once, after a slice is CLOSED / LIVE VERIFIED** — not mid-flight.
- **Nathan** approves product decisions and substantive documentation changes.
- **Claude** prepares the change (grounded in the real repo).
- **ChatGPT** reviews the documentation diff.
- **Release-state identifiers are written in `PROJECT_TRACKER.md` only.** If a change would add a deploy ID, source SHA, bundle name, Edge version or rollback target to any other document, that is the defect — point at the tracker instead.
- **Word files are generated on request from the finalized canonical Markdown, and are not committed.**

## Documentation-only changes — what is NOT required

A documentation-only change (Markdown only — nothing else) does **not** require:

- npm tests
- application build
- Preview deployment
- Production deployment
- SQL or infrastructure verification

## Documentation-only changes — required verification

Verification for a documentation-only change is limited to:

1. Authoritative-source availability (the source documents/roadmaps are present and readable).
2. Exact release-anchor comparison **against the tracker and the live platform** (SHAs, deploy IDs, migration names, versions).
3. Documentation diff review.
4. Confirmation that **only documentation files changed** (everything under `docs/`).
5. A CLEAN run of the deterministic pre-PR checker (`python C:\ArtValue-Reviewer\review.py`), which measures the documented state against the live Pages deployment, Edge version, `verify_jwt`, migrations and rollback reachability.

## Release anchor vs repository HEAD

- **Product/runtime status is anchored to the application commit and the deployment ID**, never to whatever the repository HEAD happens to be. **מצב השחרור החי — ראה [`PROJECT_TRACKER.md`](PROJECT_TRACKER.md)**: release source, Production deployment ID, served bundle, Edge `ai-gateway` version and the single current rollback target live there and **nowhere else in this directory**.
- **Repository main may advance through documentation-only commits** (like this canonical-docs work). Such commits change the repo HEAD but not the deployed application.
- **Every future task resolves the current repository HEAD live** (e.g. `git rev-parse origin/main`) at its own preflight, rather than trusting a SHA written into a committed file.
- **A docs-only advance of main does not require a build, Preview, or Production deployment, and must not be reported as application/deployment drift.**

## Security rule

**Never store passwords, tokens, API keys, secrets, private credentials, or sensitive customer data in documentation.** SHAs, deploy IDs, migration filenames, project identifiers, and version numbers are safe operational anchors; secrets are not.
