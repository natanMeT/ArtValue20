// ===================================================================
// comfyPoster — LOCAL-STUDIO-ONLY poster adapter (ComfyUI ONLY).
//
// Bridges an OfferCampaignBrief → a deterministic English key-visual prompt
// (comfyPosterPrompt) → the local ComfyUI engine, reusing the proven primitives in
// geminiImage.js. It is FAIL-CLOSED:
//   • if ComfyUI is not configured or is offline, it returns { ok:false } and does
//     NOT fall through to Pollinations, Gemini, or any external provider;
//   • it NEVER throws to the caller — the Assistant chat must never crash.
//
// No persistence, no gallery/store writes, no external API tokens, no Supabase. The
// result `src` is an ephemeral local ComfyUI /view URL — transient by design.
//
// This is the ONE sanctioned runtime importer of the poster prompt builder (enforced
// by posterIsolation.test.js). It imports posterBridge/posterSchema/posterTypes from
// NOWHERE — only comfyPosterPrompt — so the rest of the poster layer stays unwired.
// ===================================================================
import { generateImage, checkLocalEngine, hasLocalComfy } from './geminiImage.js';
import { buildComfyPosterPrompt } from '../creative/v2/poster/comfyPosterPrompt.js';

// MVP default engine = SDXL (fast ~10s). FLUX is a future optional quality mode.
const DEFAULT_ARCH = 'sdxl';

/**
 * Generate a poster image from an OfferCampaignBrief using the LOCAL ComfyUI engine.
 * Fail-closed and never throws. ComfyUI-only — no provider fallback, ever.
 *
 * @param {object} offerBrief - an OfferCampaignBrief
 * @param {object} [opts] - { aspect?: string, arch?: 'sdxl'|'flux' } (arch defaults to 'sdxl')
 * @returns {Promise<{ ok:true, src:string, engine:string, prompt:object }
 *                 | { ok:false, reason:string, prompt:(object|null) }>}
 */
export async function generatePosterFromOffer(offerBrief, opts = {}) {
  // Fail-closed #1: ComfyUI must be configured locally. Never use any other engine.
  if (!hasLocalComfy) return { ok: false, reason: 'comfy_not_configured', prompt: null };

  // Build the deterministic English prompt (never let a throw reach the UI).
  let prompt;
  try {
    prompt = buildComfyPosterPrompt(offerBrief, { aspect: opts.aspect });
  } catch {
    return { ok: false, reason: 'prompt_failed', prompt: null };
  }

  // Fail-closed #2: confirm the local engine is actually up before submitting.
  let up = false;
  try { up = await checkLocalEngine(); } catch { up = false; }
  if (!up) return { ok: false, reason: 'comfy_offline', prompt };

  // Render on the local GPU. Because hasLocalComfy is true, generateImage takes the
  // ComfyUI branch and NEVER reaches the Pollinations / Gemini fallbacks; on failure
  // it throws, which we catch into a calm { ok:false } (still no provider fallback).
  try {
    const r = await generateImage(prompt.promptEn, {
      arch: opts.arch || DEFAULT_ARCH,
      width: prompt.width,
      height: prompt.height,
    });
    if (!r || !r.src) return { ok: false, reason: 'no_image', prompt };
    // Belt-and-suspenders: only a LOCAL engine result is ever surfaced. If anything
    // but the local engine produced this (it cannot, given hasLocalComfy), reject it
    // rather than show a non-ComfyUI image.
    if (r.engine && r.engine !== 'local') return { ok: false, reason: 'unexpected_engine', prompt };
    return { ok: true, src: r.src, engine: r.engine || 'local', prompt };
  } catch {
    return { ok: false, reason: 'generation_failed', prompt };
  }
}

export default generatePosterFromOffer;
