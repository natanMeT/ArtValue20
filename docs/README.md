# ArtValue — Canonical Product Documentation

This directory is the shared source of truth for ArtValue product documentation, hosted on GitHub (`natanMeT/ArtValue20`). It replaces ad-hoc `.docx` handoffs and Claude-memory copies as the authoritative record.

## Authoritative Markdown files

The following **three Markdown files are authoritative**. They are the live source of truth; edit these, review the diff, and only then regenerate the Word exports.

| File | Role | Current version |
| --- | --- | --- |
| [`PROJECT_TRACKER.md`](PROJECT_TRACKER.md) | Living cross-session handoff — current state, anchors, status ledger, open decisions. | — (living) |
| [`roadmaps/BUSINESS_OS_MASTER_ROADMAP.md`](roadmaps/BUSINESS_OS_MASTER_ROADMAP.md) | Product roadmap — vision, modules, customer journey, launch gates, risks. | **Business OS v0.7** |
| [`roadmaps/AI_GATEWAY_MASTER_ROADMAP.md`](roadmaps/AI_GATEWAY_MASTER_ROADMAP.md) | AI infrastructure roadmap — Gateway contracts, milestones, decision log. | **AI Gateway v5.3** |

## Word exports (release artifacts only)

The `.docx` files under `releases/` are **versioned release exports generated from the canonical Markdown**. They are for reading and distribution; they must **never** become a separately edited competing source. Regenerate them from the Markdown only for meaningful roadmap milestones.

| Export | Generated from |
| --- | --- |
| [`releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.7_HE.docx`](releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.7_HE.docx) | `roadmaps/BUSINESS_OS_MASTER_ROADMAP.md` |
| [`releases/ArtValue_AI_Gateway_Master_Roadmap_v5.3_HE.docx`](releases/ArtValue_AI_Gateway_Master_Roadmap_v5.3_HE.docx) | `roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` |

Current published versions: **Business OS v0.7** · **AI Gateway v5.3**.

## Update policy

- Update documentation **once, after a slice is CLOSED / LIVE VERIFIED** — not mid-flight.
- **Nathan** approves product decisions and substantive documentation changes.
- **Claude** prepares the change (grounded in the real repo).
- **ChatGPT** reviews the documentation diff.
- **Word files are generated only for meaningful roadmap milestones**, from the finalized canonical Markdown.

## Documentation-only changes — what is NOT required

A documentation-only change (Markdown and/or its regenerated `.docx` exports, nothing else) does **not** require:

- npm tests
- application build
- Preview deployment
- Production deployment
- SQL or infrastructure verification

## Documentation-only changes — required verification

Verification for a documentation-only change is limited to:

1. Authoritative-source availability (the source documents/roadmaps are present and readable).
2. Exact release-anchor comparison (SHAs, deploy IDs, migration names, versions match the accepted record).
3. Documentation diff review.
4. Generated-document readability (each `.docx` opens and renders correctly, including Hebrew RTL).
5. Confirmation that **only documentation files changed** (everything under `docs/`).

## Security rule

**Never store passwords, tokens, API keys, secrets, private credentials, or sensitive customer data in documentation.** SHAs, deploy IDs, migration filenames, project identifiers, and version numbers are safe operational anchors; secrets are not.
