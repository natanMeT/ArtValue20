# ArtValue — Canonical Product Documentation

This directory is the shared source of truth for ArtValue product documentation, hosted on GitHub (`natanMeT/ArtValue20`). It replaces ad-hoc `.docx` handoffs and Claude-memory copies as the authoritative record.

## Authoritative Markdown files

The following **three Markdown files are authoritative**. They are the live source of truth; edit these, review the diff, and only then regenerate the Word exports.

| File | Role | Current version |
| --- | --- | --- |
| [`PROJECT_TRACKER.md`](PROJECT_TRACKER.md) | Living cross-session handoff — current state, anchors, status ledger, open decisions. | — (living) |
| [`roadmaps/BUSINESS_OS_MASTER_ROADMAP.md`](roadmaps/BUSINESS_OS_MASTER_ROADMAP.md) | Product roadmap — vision, modules, customer journey, launch gates, risks. | **Business OS v0.10** |
| [`roadmaps/AI_GATEWAY_MASTER_ROADMAP.md`](roadmaps/AI_GATEWAY_MASTER_ROADMAP.md) | AI infrastructure roadmap — Gateway contracts, milestones, decision log. | **AI Gateway v5.6** |

## Word exports (release artifacts only)

The `.docx` files under `releases/` are **versioned release exports generated from the canonical Markdown**. They are for reading and distribution; they must **never** become a separately edited competing source. Regenerate them from the Markdown only for meaningful roadmap milestones.

| Export | Generated from | Status |
| --- | --- | --- |
| [`releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.10_HE.docx`](releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.10_HE.docx) | `roadmaps/BUSINESS_OS_MASTER_ROADMAP.md` | **Current** |
| [`releases/ArtValue_AI_Gateway_Master_Roadmap_v5.6_HE.docx`](releases/ArtValue_AI_Gateway_Master_Roadmap_v5.6_HE.docx) | `roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` | **Current** |
| [`releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.9_HE.docx`](releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.9_HE.docx) | `roadmaps/BUSINESS_OS_MASTER_ROADMAP.md` | Retained historical version |
| [`releases/ArtValue_AI_Gateway_Master_Roadmap_v5.5_HE.docx`](releases/ArtValue_AI_Gateway_Master_Roadmap_v5.5_HE.docx) | `roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` | Retained historical version |
| [`releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.8_HE.docx`](releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.8_HE.docx) | `roadmaps/BUSINESS_OS_MASTER_ROADMAP.md` | Retained historical version |
| [`releases/ArtValue_AI_Gateway_Master_Roadmap_v5.4_HE.docx`](releases/ArtValue_AI_Gateway_Master_Roadmap_v5.4_HE.docx) | `roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` | Retained historical version |
| [`releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.7_HE.docx`](releases/ArtValue_Business_OS_Master_Product_Roadmap_v0.7_HE.docx) | `roadmaps/BUSINESS_OS_MASTER_ROADMAP.md` | Retained historical version |
| [`releases/ArtValue_AI_Gateway_Master_Roadmap_v5.3_HE.docx`](releases/ArtValue_AI_Gateway_Master_Roadmap_v5.3_HE.docx) | `roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` | Retained historical version |

Current published versions: **Business OS v0.10** · **AI Gateway v5.6**. Earlier exports (v0.9 / v5.5, v0.8 / v5.4 and v0.7 / v5.3) are retained as historical versions and must not be edited. **Version numbering note:** the Business OS roadmap advanced v0.9 → **v0.10**, deliberately not v1.0 — it remains a pre-beta strategic draft with durable Asset Library, durable Campaigns, module durability, organization boundaries and credits/cost controls still open. A v1.0 label would falsely signal launch readiness.

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

## Release anchor vs repository HEAD

- **Product/runtime status is anchored to the application commit and the deployment ID** (currently the Studio / Local-Engine UI Containment release source `03c23c23568905cb42e7f154014dd2ddc32bb58f` / Production `247ef9ec-ad3a-4c15-8b16-25afa1c47f2b` / bundle `index-BZ3B-0yd.js`), never to whatever the repository HEAD happens to be. The single current rollback target is `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`; older deployments are historical fallbacks only.
- **Repository main may advance through documentation-only commits** (like this canonical-docs work). Such commits change the repo HEAD but not the deployed application.
- **Every future task resolves the current repository HEAD live** (e.g. `git rev-parse origin/main`) at its own preflight, rather than trusting a SHA written into a committed file.
- **A docs-only advance of main does not require a build, Preview, or Production deployment, and must not be reported as application/deployment drift.**

## Security rule

**Never store passwords, tokens, API keys, secrets, private credentials, or sensitive customer data in documentation.** SHAs, deploy IDs, migration filenames, project identifiers, and version numbers are safe operational anchors; secrets are not.
