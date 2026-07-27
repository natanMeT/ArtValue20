// ===================================================================
// Critic-evaluation runner over the pure engine (criticEval.js).
//
// FIXTURE mode is the ONLY mode: it replays the committed baseline snapshot
// (v1Snapshots.json) through the REAL critic and scores it against the
// committed goldens. Fully deterministic — no model, no network.
//
// The REAL (opt-in) mode was REMOVED with the local-engine retirement
// (2026-07-27): it called a workstation model through the adapter to write a
// candidate artifact, so it could never run again once the product became
// cloud-only. The committed baseline snapshot it once produced is unchanged.
// ===================================================================
import SNAPSHOT from './v1Snapshots.json';
import { GOLDENS } from './goldens.js';
import { critiqueConcepts } from '../conceptCritic.js';
import { runEvaluation } from './criticEval.js';

/** Replay the committed baseline snapshot through the critic and score it. */
export async function runFixtureEval() {
  const items = [];
  for (const [bid, entry] of Object.entries(SNAPSHOT.snapshots)) {
    const { request, result } = entry.samples[0];
    const critique = await critiqueConcepts({ concepts: result.concepts, strategy: result.strategy, request });
    items.push({ request, result, critique, golden: GOLDENS[bid] });
  }
  const meta = {
    mode: 'fixture', source: SNAPSHOT.meta.source, model: SNAPSHOT.meta.model,
    sampleCount: SNAPSHOT.meta.sampleCount, createdAt: SNAPSHOT.meta.createdAt,
  };
  return runEvaluation(items, meta);
}

export default runFixtureEval;
