// ===================================================================
// localComfyEngine — the LOCAL ComfyUI bridge, kept ONLY for its two proven
// non-Studio consumers.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Image Studio is
// CLOUD/GATEWAY ONLY and no longer imports anything from this module. What
// remains here is exactly what two surfaces OUTSIDE the Studio still call, and
// nothing else — every Studio-only path (smart edit, area edit, image→video,
// before/after, product presenter, character pack, model album, the Product
// Lock AI blend, checkpoint listing, engine job cards) was deleted rather than
// kept dormant:
//
//   • src/pages/AdStudio.jsx        -> generateMaxRealism
//   • src/lib/comfyPoster.js (Jake) -> generateLocalImage / checkLocalEngine / hasLocalComfy
//
// If either consumer goes away, so does its function. The module is gated by
// `resolveLocalEngineUrl`, so in every hosted production build COMFY_URL is ''
// and every entry point here refuses before issuing a request.
// ===================================================================

import { resolveLocalEngineUrl } from './localEngines.js';
import { userError } from './userFacingError.js';

export const hasLocalComfy = Boolean(resolveLocalEngineUrl(import.meta.env.VITE_COMFYUI_URL));

const COMFY_URL = resolveLocalEngineUrl(import.meta.env.VITE_COMFYUI_URL);
const COMFY_MODEL = import.meta.env.VITE_COMFYUI_MODEL || 'RealVisXL_V4.0.safetensors';
const COMFY_FLUX_MODEL = import.meta.env.VITE_COMFYUI_FLUX_MODEL || 'flux1-dev-fp8.safetensors';
// Realism LoRA for Flux — kills the "plastic AI skin" look. Empty string disables it.
const FLUX_LORA = import.meta.env.VITE_COMFYUI_FLUX_LORA ?? 'flux-super-realism.safetensors';
const FLUX_LORA_STRENGTH = Number(import.meta.env.VITE_COMFYUI_FLUX_LORA_STRENGTH || 0.85);
const FLUX_GUIDANCE = Number(import.meta.env.VITE_COMFYUI_FLUX_GUIDANCE || 3.5);

const FACE_BBOX_MODEL = import.meta.env.VITE_COMFYUI_FACE_BBOX || 'bbox/face_yolov8m.pt';
// ESRGAN upscaler — keeps catalog images crisp when zoomed in.
const FACE_UPSCALE_MODEL = import.meta.env.VITE_COMFYUI_UPSCALE_MODEL || '4x-UltraSharp.pth';

export async function checkLocalEngine() {
  if (!COMFY_URL) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${COMFY_URL}/system_stats`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

function sdxlGraph(prompt, seed, w = 1024, h = 1024, hd = false, model = COMFY_MODEL) {
  // In portrait (chosen for full-body people) actively discourage head-only crops.
  const neg = 'lowres, bad anatomy, blurry, watermark, text, deformed, ugly, smooth skin, plastic, waxy, airbrushed, 3d render, cgi'
    + (h > w ? ', cropped, close-up, headshot, out of frame' : '');
  const g = {
    '3': { class_type: 'KSampler', inputs: { seed, steps: 30, cfg: 4.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model || COMFY_MODEL } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: neg, clip: ['4', 1] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue', images: ['8', 0] } },
  };
  if (hd) {
    // hires-fix: upscale the latent 1.5× and refine at low denoise → ~1.5× resolution, crisp.
    g['12'] = { class_type: 'LatentUpscaleBy', inputs: { samples: ['3', 0], upscale_method: 'nearest-exact', scale_by: 1.5 } };
    g['13'] = { class_type: 'KSampler', inputs: { seed, steps: 18, cfg: 4.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 0.45, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['12', 0] } };
    g['8'] = { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: ['4', 2] } };
  } else {
    g['8'] = { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } };
  }
  return g;
}

function fluxGraph(prompt, seed, w = 1024, h = 1024, model = COMFY_FLUX_MODEL) {
  // Photographic realism wrapper — natural texture instead of airbrushed CGI.
  const trigger = FLUX_LORA ? 'Super Realism, ' : '';
  const realPrompt = `${trigger}${prompt}, candid photograph, natural skin texture with visible pores, realistic detailed skin, photorealistic, sharp focus, high detail`;
  const modelSrc = FLUX_LORA ? ['11', 0] : ['4', 0];
  const g = {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model || COMFY_FLUX_MODEL } },
    '5': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: realPrompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    '10': { class_type: 'FluxGuidance', inputs: { conditioning: ['6', 0], guidance: FLUX_GUIDANCE } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: 26, cfg: 1, sampler_name: 'euler', scheduler: 'beta', denoise: 1, model: modelSrc, positive: ['10', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue', images: ['8', 0] } },
  };
  if (FLUX_LORA) {
    g['11'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['4', 0], lora_name: FLUX_LORA, strength_model: FLUX_LORA_STRENGTH } };
  }
  return g;
}

function rndSeed() { return Math.floor(Math.random() * 1e15); }

const jobListeners = new Set();
let nextJobTag = null;
export function onComfyJob(cb) { jobListeners.add(cb); return () => jobListeners.delete(cb); }
export function markNextComfyJob(tag) { nextJobTag = tag; }

async function comfySubmit(graph) {
  const tag = nextJobTag; nextJobTag = null;
  const clientId = `artvalue-${rndSeed()}`;
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  if (!res.ok) throw engineError(`comfy ${res.status}`, 'היצירה נכשלה כרגע. נסה/י שוב בעוד רגע.');
  const { prompt_id } = await res.json();
  if (!prompt_id) throw engineError('comfy: no prompt id', 'היצירה נכשלה כרגע. נסה/י שוב בעוד רגע.');
  for (const cb of [...jobListeners]) {
    try { cb({ promptId: prompt_id, clientId, tag, graph, at: Date.now() }); } catch { /* noop */ }
  }
  return prompt_id;
}

async function comfyWait(promptId, maxTries = 200) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const h = await fetch(`${COMFY_URL}/history/${promptId}`);
    if (!h.ok) continue;
    const entry = (await h.json())?.[promptId];
    const outputs = entry?.outputs;
    if (outputs) {
      for (const node of Object.values(outputs)) {
        const media = node?.images?.[0] || node?.gifs?.[0];
        if (media) {
          const q = `filename=${encodeURIComponent(media.filename)}&subfolder=${encodeURIComponent(media.subfolder || '')}&type=${encodeURIComponent(media.type || 'output')}`;
          return `${COMFY_URL}/view?${q}`;
        }
      }
    }
    if (entry?.status?.status_str === 'error') throw engineError('comfy: generation error', 'היצירה נכשלה כרגע. נסה/י שוב בעוד רגע.');
  }
  throw engineError('comfy: timeout', 'היצירה לוקחת יותר מדי זמן. נסה/י שוב בעוד רגע.');
}

async function comfyUI(text, useFlux = false, w = 1024, h = 1024, hd = false, model = '') {
  const graph = useFlux ? fluxGraph(text, rndSeed(), w, h, model) : sdxlGraph(text, rndSeed(), w, h, hd, model);
  const src = await comfyWait(await comfySubmit(graph), hd ? 320 : 200);
  return { src, engine: 'local', demo: false };
}

// Realism prompt wrappers used by maxRealismGraph. These were left behind when
// the module was split out of geminiImage.js, which made every configured
// AdStudio render throw a ReferenceError before submitting a job.
const FACE_WILD = 'extreme skin detail, visible pores on cheeks nose and forehead, peach fuzz vellus hair, individual eyebrow hairs, baby hairs along the hairline, long eyelashes, catchlight in the eyes, detailed iris, natural lip texture, subtle dewy skin highlights, raw unretouched skin, no heavy makeup';

function wrapRealism(prompt) {
  const trigger = FLUX_LORA ? 'Super Realism, ' : '';
  return `${trigger}raw photo, professional beauty editorial, ${prompt}, ${REAL_HAIR}, ${REAL_MICRO}, ${REAL_SKIN}`;
}

const NATURAL_WILD = 'bare skin no makeup, visible pores, real natural skin texture, subtle natural imperfections, no smoothing, no retouch';

function wrapNatural(prompt) {
  return `raw natural photograph, candid, ${prompt}, ${NATURAL_SKIN}`;
}

function maxRealismGraph(prompt, seed, opts = {}) {
  const w = opts.width ?? 1024;
  const h = opts.height ?? 1280;
  const guidance = opts.guidance ?? 2.5;
  const loraStrength = opts.loraStrength ?? 0.55;
  const steps = opts.steps ?? 28;
  const faceDetail = opts.faceDetail !== false;
  const faceCycle = opts.faceCycle ?? 2;
  const faceDenoise = opts.faceDenoise ?? 0.5;
  const faceGuide = opts.faceGuide ?? 1024;
  const upscale = opts.upscale !== false;
  const natural = opts.natural === true;
  const useLora = Boolean(FLUX_LORA) && !natural;
  const realPrompt = natural ? wrapNatural(prompt) : wrapRealism(prompt);
  const faceWild = natural ? NATURAL_WILD : FACE_WILD;
  const modelSrc = useLora ? ['40', 0] : ['4', 0];
  const g = {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_FLUX_MODEL } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: realPrompt, clip: ['4', 1] } },
    '24': { class_type: 'FluxGuidance', inputs: { conditioning: ['6', 0], guidance: guidance } },
    '25': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } },
    '5': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: steps, cfg: 1, sampler_name: 'euler', scheduler: 'beta', denoise: 1, model: modelSrc, positive: ['24', 0], negative: ['25', 0], latent_image: ['5', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  };
  if (useLora) {
    g['40'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['4', 0], lora_name: FLUX_LORA, strength_model: loraStrength } };
  }
  if (faceDetail) {
    g['50'] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: FACE_BBOX_MODEL } };
    g['60'] = { class_type: 'FaceDetailer', inputs: {
      image: ['8', 0], model: modelSrc, clip: ['4', 1], vae: ['4', 2],
      guide_size: faceGuide, guide_size_for: true, max_size: 1536,
      seed: seed + 1, steps: steps, cfg: 1, sampler_name: 'euler', scheduler: 'beta',
      positive: ['24', 0], negative: ['25', 0], denoise: faceDenoise,
      feather: 6, noise_mask: true, force_inpaint: true,
      bbox_threshold: 0.5, bbox_dilation: 10, bbox_crop_factor: 3.0,
      sam_detection_hint: 'center-1', sam_dilation: 0, sam_threshold: 0.93,
      sam_bbox_expansion: 0, sam_mask_hint_threshold: 0.7, sam_mask_hint_use_negative: 'False',
      drop_size: 10, bbox_detector: ['50', 0], wildcard: faceWild, cycle: faceCycle,
    } };
  }
  const finalImg = faceDetail ? ['60', 0] : ['8', 0];
  if (upscale) {
    g['70'] = { class_type: 'UpscaleModelLoader', inputs: { model_name: FACE_UPSCALE_MODEL } };
    g['71'] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['70', 0], image: finalImg } };
    g['72'] = { class_type: 'ImageScaleBy', inputs: { image: ['71', 0], upscale_method: 'lanczos', scale_by: 0.5 } };
    g['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_maxreal', images: ['72', 0] } };
  } else {
    g['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_maxreal', images: finalImg } };
  }
  return g;
}

// Node/model probes, cached per session. They only run when the engine is
// configured, and never at import time.
let faceDetailerCache = null;
let upscaleCache = null;

export async function hasFaceDetailerNode() {
  if (faceDetailerCache !== null) return faceDetailerCache;
  if (!COMFY_URL) { faceDetailerCache = false; return false; }
  try {
    const r = await fetch(`${COMFY_URL}/object_info/FaceDetailer`);
    const j = await r.json();
    faceDetailerCache = Boolean(j && j.FaceDetailer);
  } catch { faceDetailerCache = false; }
  return faceDetailerCache;
}

export async function hasUpscaleModel() {
  if (upscaleCache !== null) return upscaleCache;
  if (!COMFY_URL) { upscaleCache = false; return false; }
  try {
    const r = await fetch(`${COMFY_URL}/object_info/UpscaleModelLoader`);
    const j = await r.json();
    const list = parseComfyOptions(j?.UpscaleModelLoader?.input?.required?.model_name);
    upscaleCache = list.includes(FACE_UPSCALE_MODEL);
  } catch { upscaleCache = false; }
  return upscaleCache;
}

export async function generateMaxRealism(prompt, opts = {}) {
  if (!COMFY_URL) throw userError('היצירה אינה זמינה כרגע');
  const text = (prompt || '').trim();
  if (!text) throw new Error('יש להזין תיאור לתמונה');
  const faceDetail = opts.faceDetail !== false && await hasFaceDetailerNode();
  const upscale = opts.upscale !== false && await hasUpscaleModel();
  const graph = maxRealismGraph(text, rndSeed(), { ...opts, faceDetail, upscale });
  const src = await comfyWait(await comfySubmit(graph), 400);
  return { src, engine: 'local', demo: false, maxreal: true };
}

// The local text-to-image entry point for the Jake poster adapter. It is
// deliberately NOT named `generateImage`: that name belongs to the hosted
// Gateway lane in `hostedImage.js`, and the two must never be confused at a
// call site. FAIL CLOSED when the engine is not configured.
export async function generateLocalImage(prompt, opts = {}) {
  if (!COMFY_URL) throw userError('היצירה אינה זמינה כרגע');
  const text = (prompt || '').trim();
  if (!text) throw userError('יש להזין תיאור לתמונה');
  const useFlux = opts.arch === 'flux' || opts.quality === 'max';
  return comfyUI(text, useFlux, opts.width || 1024, opts.height || 1024, Boolean(opts.hd), opts.model || '');
}
