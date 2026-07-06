// ===================================================================
// studioHandoff — pure validator + workflow→mode mapper for a Jake
// handoff passed into Image Studio via router `location.state`.
//
// Phase 2 of the Studio handoff. This module ONLY reads and validates a
// plain object and maps a workflow id to an ImageStudio mode. It executes
// nothing: no generation, no navigation, no events, no storage, no clock,
// no window. `creativeWorkflows.js` is the single source of truth for the
// id→mode mapping (reused, never duplicated); only LIVE workflows map.
// ===================================================================

import { CREATIVE_WORKFLOWS } from '../data/creativeWorkflows.js';

// The only source/target this consumer accepts.
export const STUDIO_HANDOFF_SOURCE = 'jake';
export const STUDIO_HANDOFF_TARGET = 'studio';

// Map a workflow id to its ImageStudio mode, from the live catalog only.
// Unknown / missing / soon (mode === null) → null. Never throws.
export function workflowIdToMode(workflowId) {
  if (typeof workflowId !== 'string' || !workflowId) return null;
  const w = CREATIVE_WORKFLOWS.find((x) => x.id === workflowId && x.status === 'live');
  return w && typeof w.mode === 'string' ? w.mode : null;
}

// Read + validate a router location.state handoff. Returns { prompt, mode }
// for a valid Jake→Studio payload (mode is the mapped live mode, or null when
// the workflow is unknown/missing — the prompt still prefills). Any invalid
// or hostile input → null. Pure; never throws; no side effects.
export function readStudioHandoff(locationState) {
  if (!locationState || typeof locationState !== 'object') return null;
  const h = locationState.jakeHandoff;
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  if (h.source !== STUDIO_HANDOFF_SOURCE) return null;
  if (h.target !== STUDIO_HANDOFF_TARGET) return null;
  if (typeof h.prompt !== 'string' || !h.prompt.trim()) return null;
  return { prompt: h.prompt, mode: workflowIdToMode(h.workflow) };
}
