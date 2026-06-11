// ===================================================================
// AI image generation — Gemini "Nano Banana" (gemini-2.5-flash-image).
// Reuses VITE_GEMINI_API_KEY. With no key it falls back to a free,
// no-key generator (Pollinations) so the studio works in demo mode.
// Returns { src, engine, demo }.
// ===================================================================

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const IMG_MODEL = import.meta.env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
// Local GPU image server (e.g. AUTOMATIC1111 / Forge with --api). Free, runs on your machine.
const LOCAL_URL = (import.meta.env.VITE_LOCAL_IMAGE_URL || '').replace(/\/$/, '');
// ComfyUI local server (its API differs from A1111). Default port 8188.
const COMFY_URL = (import.meta.env.VITE_COMFYUI_URL || '').replace(/\/$/, '');
const COMFY_MODEL = import.meta.env.VITE_COMFYUI_MODEL || 'RealVisXL_V4.0.safetensors';
const COMFY_FLUX_MODEL = import.meta.env.VITE_COMFYUI_FLUX_MODEL || 'flux1-dev-fp8.safetensors';
// Realism LoRA for Flux — kills the "plastic AI skin" look. Empty string disables it.
const FLUX_LORA = import.meta.env.VITE_COMFYUI_FLUX_LORA ?? 'flux-super-realism.safetensors';
const FLUX_LORA_STRENGTH = Number(import.meta.env.VITE_COMFYUI_FLUX_LORA_STRENGTH || 0.85);
const FLUX_GUIDANCE = Number(import.meta.env.VITE_COMFYUI_FLUX_GUIDANCE || 3.5);
const COMFY_SVD_MODEL = import.meta.env.VITE_COMFYUI_SVD_MODEL || 'svd_xt_1_1.safetensors';
// LTX-Video — real local text/image-to-video (much stronger than SVD).
const LTX_MODEL = import.meta.env.VITE_COMFYUI_LTX_MODEL || 'ltx-video-2b-v0.9.5.safetensors';
const LTX_CLIP = import.meta.env.VITE_COMFYUI_LTX_CLIP || 't5xxl_fp8_e4m3fn.safetensors';
// FLUX.1 Kontext — instruction-based photo editing (preserves identity/faces).
const COMFY_KONTEXT_MODEL = import.meta.env.VITE_COMFYUI_KONTEXT_MODEL || 'flux1-dev-kontext_fp8_scaled.safetensors';
// PuLID-Flux — face-identity injection: generate brand-new scenes that keep the SAME face.
const COMFY_PULID_MODEL = import.meta.env.VITE_COMFYUI_PULID_MODEL || 'pulid_flux_v0.9.1.safetensors';
// FaceDetailer (Impact Pack) face detector — re-renders the face for photoreal skin detail.
const FACE_BBOX_MODEL = import.meta.env.VITE_COMFYUI_FACE_BBOX || 'bbox/face_yolov8m.pt';
// ESRGAN upscaler — keeps catalog images crisp when zoomed in.
const FACE_UPSCALE_MODEL = import.meta.env.VITE_COMFYUI_UPSCALE_MODEL || '4x-UltraSharp.pth';
// Qwen-Image-Edit 2509 (GGUF Q8) — instruction editing that keeps identity 100%.
// fp8 is broken on this CUDA build (pure noise); the GGUF kernels work cleanly.
const QWEN_UNET = import.meta.env.VITE_COMFYUI_QWEN_UNET || 'Qwen-Image-Edit-2509-Q8_0.gguf';
const QWEN_CLIP = import.meta.env.VITE_COMFYUI_QWEN_CLIP || 'qwen_2.5_vl_7b_fp8_scaled.safetensors';
const QWEN_VAE = import.meta.env.VITE_COMFYUI_QWEN_VAE || 'qwen_image_vae.safetensors';
const QWEN_LIGHTNING = import.meta.env.VITE_COMFYUI_QWEN_LIGHTNING || 'Qwen-Image-Edit-2509-Lightning-8steps.safetensors';
// Feature flags for the UI.
export const hasFluxModel = Boolean(COMFY_URL && COMFY_FLUX_MODEL);
export const hasLocalComfy = Boolean(COMFY_URL);       // enables img2img (uses existing models)
export const hasVideoModel = Boolean(COMFY_URL && COMFY_SVD_MODEL); // enables image→video (SVD)
export const hasLtxVideo = Boolean(COMFY_URL && LTX_MODEL && LTX_CLIP); // stronger prompt-guided video
export const hasKontextModel = Boolean(COMFY_URL && COMFY_KONTEXT_MODEL && COMFY_FLUX_MODEL); // smart editing
export const localEngineUrl = COMFY_URL;

// Ping the local engine. Returns true if ComfyUI is up and reachable.
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
// Pollinations now requires an API key (get one free at https://enter.pollinations.ai).
// Uses the new gen.pollinations.ai endpoint. pk_ = publishable (frontend-safe), sk_ = secret.
const POLLI_TOKEN = import.meta.env.VITE_POLLINATIONS_TOKEN || '';
const POLLI_MODEL = import.meta.env.VITE_POLLINATIONS_MODEL || 'flux';

export const isImageAiConfigured = Boolean(API_KEY || LOCAL_URL || COMFY_URL || POLLI_TOKEN);
export const imageEngineName = (LOCAL_URL || COMFY_URL) ? 'מקומי · Stable Diffusion' : POLLI_TOKEN ? 'Pollinations · Flux' : API_KEY ? 'Nano Banana · Gemini' : null;

function pollinations(text) {
  const seed = Math.floor(Math.random() * 1_000_000);
  const src = `https://gen.pollinations.ai/image/${encodeURIComponent(text)}?model=${POLLI_MODEL}&width=1024&height=1024&nologo=true&seed=${seed}&key=${encodeURIComponent(POLLI_TOKEN)}`;
  return { src, engine: 'pollinations', demo: false };
}

// Local Stable Diffusion (AUTOMATIC1111 / Forge txt2img API)
async function localSD(text) {
  const res = await fetch(`${LOCAL_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: text, steps: 28, width: 1024, height: 1024, cfg_scale: 7, sampler_name: 'DPM++ 2M Karras' }),
  });
  if (!res.ok) throw new Error(`local ${res.status}`);
  const json = await res.json();
  const b64 = json?.images?.[0];
  if (!b64) throw new Error('no image from local server');
  return { src: `data:image/png;base64,${b64}`, engine: 'local', demo: false };
}

// ComfyUI txt2img via its prompt/history/view API.
// SDXL graph (fast, ~10s) — uses CFG + negative prompt.
// hd=true adds a hires pass (1.5× latent upscale + refine) for a bigger, sharper image.
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

// FLUX.1-dev graph (max quality, ~25-40s). Realism LoRA + lower guidance + photographic
// cues defeat the "plastic AI skin / 100% AI" look. CFG=1, no negative (Flux).
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

// SDXL image-to-image graph: re-paint an uploaded image (denoise = strength).
function img2imgGraph(imageName, prompt, strength, seed) {
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_MODEL } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '12': { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['10', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 64 } },
    '11': { class_type: 'VAEEncode', inputs: { pixels: ['12', 0], vae: ['4', 2] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt || 'high quality, detailed', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'lowres, blurry, watermark, text, deformed, ugly', clip: ['4', 1] } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: 28, cfg: 6, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: strength, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['11', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_i2i', images: ['8', 0] } },
  };
}

// Stable Video Diffusion: turn one image into a short animated clip (saved as animated WebP).
function svdGraph(imageName, seed, opts = {}) {
  const frames = opts.frames || 25;
  const fps = opts.fps || 8;
  const motion = opts.motion || 127;
  return {
    '4': { class_type: 'ImageOnlyCheckpointLoader', inputs: { ckpt_name: COMFY_SVD_MODEL } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '5': { class_type: 'SVD_img2vid_Conditioning', inputs: { clip_vision: ['4', 1], init_image: ['10', 0], vae: ['4', 2], width: 1024, height: 576, video_frames: frames, motion_bucket_id: motion, fps, augmentation_level: 0.0 } },
    '7': { class_type: 'VideoLinearCFGGuidance', inputs: { model: ['4', 0], min_cfg: 1.0 } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: 20, cfg: 2.5, sampler_name: 'euler', scheduler: 'karras', denoise: 1, model: ['7', 0], positive: ['5', 0], negative: ['5', 1], latent_image: ['5', 2] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'artvalue_vid', fps, lossless: false, quality: 88, method: 'default' } },
  };
}

// FLUX.1 Kontext — instruction editing. Reuses the Flux checkpoint's CLIP+VAE,
// loads the Kontext UNet separately. Preserves the original (faces, people, layout)
// and only applies the requested change.
function kontextGraph(imageName, instruction, seed) {
  return {
    '20': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_FLUX_MODEL } }, // CLIP(1) + VAE(2)
    '21': { class_type: 'UNETLoader', inputs: { unet_name: COMFY_KONTEXT_MODEL, weight_dtype: 'default' } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '22': { class_type: 'FluxKontextImageScale', inputs: { image: ['10', 0] } },
    '11': { class_type: 'VAEEncode', inputs: { pixels: ['22', 0], vae: ['20', 2] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: instruction, clip: ['20', 1] } },
    '23': { class_type: 'ReferenceLatent', inputs: { conditioning: ['6', 0], latent: ['11', 0] } },
    '24': { class_type: 'FluxGuidance', inputs: { conditioning: ['23', 0], guidance: 2.5 } },
    '25': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: 20, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['21', 0], positive: ['24', 0], negative: ['25', 0], latent_image: ['11', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['20', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_kontext', images: ['8', 0] } },
  };
}

// SDXL inpainting: regenerate ONLY the masked region from a prompt, keep the rest
// pixel-perfect. Uses the realism SDXL model (uncensored for fashion/swimwear).
function inpaintGraph(imageName, maskName, prompt, seed) {
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_MODEL } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '13': { class_type: 'LoadImage', inputs: { image: maskName } },
    '14': { class_type: 'ImageToMask', inputs: { image: ['13', 0], channel: 'red' } },
    '11': { class_type: 'VAEEncodeForInpaint', inputs: { pixels: ['10', 0], vae: ['4', 2], mask: ['14', 0], grow_mask_by: 8 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'lowres, blurry, deformed, watermark, text', clip: ['4', 1] } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: 28, cfg: 6, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['11', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_inpaint', images: ['8', 0] } },
  };
}

// --- ComfyUI low-level helpers (shared by all local modes) ---
function rndSeed() { return Math.floor(Math.random() * 1e15); }

async function comfySubmit(graph) {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: `artvalue-${rndSeed()}` }),
  });
  if (!res.ok) throw new Error(`comfy ${res.status}`);
  const { prompt_id } = await res.json();
  if (!prompt_id) throw new Error('comfy: no prompt id');
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
    if (entry?.status?.status_str === 'error') throw new Error('comfy: generation error');
  }
  throw new Error('comfy: timeout');
}

// Upload a File/Blob to ComfyUI and return its server-side name.
async function uploadToComfy(file) {
  const fd = new FormData();
  fd.append('image', file, file.name || 'upload.png');
  fd.append('overwrite', 'true');
  const r = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  const j = await r.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

async function comfyUI(text, useFlux = false, w = 1024, h = 1024, hd = false, model = '') {
  const graph = useFlux ? fluxGraph(text, rndSeed(), w, h, model) : sdxlGraph(text, rndSeed(), w, h, hd, model);
  const src = await comfyWait(await comfySubmit(graph), hd ? 320 : 200);
  return { src, engine: 'local', demo: false };
}

// Human-friendly checkpoint label: "juggernaut-xl-v9.safetensors" -> "Juggernaut Xl V9".
function prettyModelName(file) {
  return String(file)
    .replace(/\.(safetensors|ckpt|sft|pth)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase())
    .trim();
}

// Dynamically list the LOCAL image checkpoints installed in ComfyUI, so the UI can
// offer a model picker. Auto-updates as the user drops new checkpoints in. Video
// checkpoints (LTX/SVD/Wan/…) are filtered out — they aren't text→image models.
export async function listImageModels() {
  if (!COMFY_URL) return [];
  try {
    const res = await fetch(`${COMFY_URL}/object_info/CheckpointLoaderSimple`);
    if (!res.ok) return [];
    const j = await res.json();
    const all = j?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    return all
      .filter((f) => !/ltx|svd|stable.?video|\bwan\b|mochi|hunyuan.?video|cogvideo/i.test(f))
      .map((f) => ({ file: f, flux: /flux/i.test(f), arch: /flux/i.test(f) ? 'flux' : 'sdxl', label: prettyModelName(f) }));
  } catch { return []; }
}

// Image-to-image: upload + repaint. strength 0.2 (subtle) .. 0.95 (heavy change).
export async function generateImg2Img(file, prompt, opts = {}) {
  if (!COMFY_URL) throw new Error('עריכת תמונה זמינה רק עם ComfyUI מקומי');
  const strength = Math.min(0.95, Math.max(0.2, opts.strength ?? 0.6));
  const name = await uploadToComfy(file);
  const graph = img2imgGraph(name, (prompt || '').trim(), strength, rndSeed());
  const src = await comfyWait(await comfySubmit(graph), 200);
  return { src, engine: 'local', demo: false };
}

// Smart photo editing (FLUX.1 Kontext): keep the original, apply an instruction.
// e.g. "change the background to a sunset beach", "make the swimsuit red".
export async function editImage(file, instruction) {
  if (!hasKontextModel) throw new Error('עריכה חכמה זמינה רק עם מודל Kontext מקומי');
  const text = (instruction || '').trim();
  if (!text) throw new Error('יש לכתוב מה לשנות בתמונה');
  const name = await uploadToComfy(file);
  const graph = kontextGraph(name, text, rndSeed());
  const src = await comfyWait(await comfySubmit(graph), 200);
  return { src, engine: 'local', demo: false, kontext: true };
}

// Curated pose/angle/scene instructions for a consistent-character pack. Each keeps
// the SAME person (Kontext anchors on the reference) and varies framing/setting —
// the sweet spot for identity consistency. Ordered easy→varied.
export const CHARACTER_POSES = [
  'same person, three-quarter view, gentle smile, soft studio lighting, clean background',
  'same person, side profile portrait, neutral expression, plain background',
  'same person, looking slightly away, natural outdoor daylight, soft bokeh',
  'same person, close-up portrait, confident expression, shallow depth of field',
  'same person, full body, standing, casual outfit, modern city street',
  'same person, sitting at a modern cafe, candid, warm window light',
  'same person, laughing naturally, bright daylight, outdoor',
  'same person, elegant outfit, full body, indoor studio backdrop',
  'same person, slight head tilt, dramatic cinematic side lighting',
  'same person, walking, full body, golden hour street, motion',
];

// Consistent-character pack: from ONE reference, produce N identity-consistent
// variations via FLUX Kontext (different angle/pose/scene). Uploads once, runs
// sequentially (FLUX can't parallelize on 16GB), and reports each as it lands so
// the UI can stream results + save them to the gallery for later animation.
export async function characterPack(file, count = 6, onResult) {
  if (!hasKontextModel) throw new Error('ערכת דמות זמינה רק עם מודל Kontext מקומי');
  if (!file) throw new Error('יש להעלות תמונת ייחוס של הדמות');
  const name = await uploadToComfy(file);
  const poses = CHARACTER_POSES.slice(0, Math.max(1, Math.min(count, CHARACTER_POSES.length)));
  const out = [];
  for (let i = 0; i < poses.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const src = await comfyWait(await comfySubmit(kontextGraph(name, poses[i], rndSeed())), 220);
    const r = { src, engine: 'local', demo: false, kontext: true, character: true, pose: poses[i], index: i };
    out.push(r);
    if (typeof onResult === 'function') { try { onResult(r, i, poses.length); } catch { /* noop */ } }
  }
  return out;
}

// PuLID scenes — UNLIKE Kontext (which edits the uploaded image), PuLID generates
// a FRESH image from a text prompt while injecting the reference FACE identity. So
// prompts describe the whole scene/pose, not "same person".
export const PULID_SCENES = [
  'professional studio headshot, three-quarter view, soft key light, plain grey background, photorealistic',
  'side profile portrait, neutral expression, clean studio background',
  'full body, standing on a sunny city street, casual modern outfit, golden hour, candid',
  'sitting at a cozy cafe, gentle smile, warm window light, candid lifestyle photo',
  'close-up portrait, confident expression, shallow depth of field, natural light',
  'full body, walking outdoors in a park, relaxed, soft daylight',
  'elegant outfit, full body, indoor studio backdrop, fashion photography',
  'outdoor portrait, looking slightly away, soft bokeh, natural daylight',
  'upper body portrait, cinematic side lighting, dramatic mood',
  'full body, golden hour street, walking, lifestyle fashion shot',
];

// PuLID-Flux graph: inject the FACE identity from `faceName` into a fresh image
// described by `prompt`. InsightFace runs on CPU (the cu13 build lacks the cu12
// cuBLAS DLLs onnxruntime-gpu wants — face detection is a tiny slice of runtime).
// The realism LoRA + skin-texture cues defeat FLUX's over-smooth "plastic" skin,
// and PuLID end_at < 1.0 lets the last steps restore pores/texture the identity
// injection would otherwise iron out (identity is already locked by then).
// ---- Shared photoreal prompt wrappers (used by PuLID + Max-Realism pipelines) ----
// Editorial-beauty realism that matches real model reference photos: natural DEWY skin
// with subtle highlights AND clearly visible pores (not flat matte, not plastic), no heavy
// makeup, plus micro-detail — individual brow hairs, baby hairs, lashes, catchlights, lips.
const REAL_HAIR = 'natural hair with fine flyaway strands and realistic individual hair strands, natural hair texture, not glossy plastic';
const REAL_MICRO = 'thick natural eyebrows with individual hairs, fine baby hairs and flyaway strands along the hairline, long detailed eyelashes, sharp catchlight reflection in the eyes, detailed iris, natural lips with fine lip texture lines and subtle gloss, detailed ear, peach fuzz vellus hair on cheeks';
const REAL_SKIN = 'natural healthy skin with subtle dewy highlights and clearly visible skin pores, realistic skin texture and fine detail, subtle natural skin imperfections and freckles, no heavy makeup, no airbrushing, not plastic, photorealistic, raw high resolution photo, sharp focus';
const FACE_WILD = 'extreme skin detail, visible pores on cheeks nose and forehead, peach fuzz vellus hair, individual eyebrow hairs, baby hairs along the hairline, long eyelashes, catchlight in the eyes, detailed iris, natural lip texture, subtle dewy skin highlights, raw unretouched skin, no heavy makeup';
// Build the wrapped realism prompt.
function wrapRealism(prompt) {
  const trigger = FLUX_LORA ? 'Super Realism, ' : '';
  return `${trigger}raw photo, professional beauty editorial, ${prompt}, ${REAL_HAIR}, ${REAL_MICRO}, ${REAL_SKIN}`;
}

// ---- "Natural skin" wrappers (the validated model-album recipe) — NO realism LoRA,
// NO dewy/editorial polish: bare face, visible pores, real texture, zero smoothing.
const NATURAL_SKIN = 'bare face no makeup, natural realistic skin with visible pores and real skin texture, subtle natural imperfections, no airbrushing, no smoothing, no beauty filter, no retouching, photorealistic, sharp, soft natural daylight';
const NATURAL_WILD = 'bare skin no makeup, visible pores, real natural skin texture, subtle natural imperfections, no smoothing, no retouch';
function wrapNatural(prompt) {
  return `raw natural photograph, candid, ${prompt}, ${NATURAL_SKIN}`;
}

function pulidGraph(faceName, prompt, seed, w = 1152, h = 1536, weight = 0.85, faceDetail = false, upscale = false, opts = {}) {
  // Tunable knobs (defaults = the validated max-realism config).
  const guidance = opts.guidance ?? 3.0;       // lower = more natural skin
  const loraStrength = opts.loraStrength ?? 0.6; // realism LoRA strength
  const steps = opts.steps ?? 24;
  const faceCycle = opts.faceCycle ?? 1;         // FaceDetailer passes (2 = more texture)
  const faceDenoise = opts.faceDenoise ?? 0.5;
  const faceGuide = opts.faceGuide ?? 1024;
  // Natural mode (model albums): drop the realism LoRA + dewy/editorial cues for
  // genuinely raw, un-retouched skin. Identity still locked by PuLID.
  const natural = opts.natural === true;
  const useLora = Boolean(FLUX_LORA) && !natural;
  const realPrompt = natural ? wrapNatural(prompt) : wrapRealism(prompt);
  const faceWild = natural ? NATURAL_WILD : FACE_WILD;
  const modelSrc = useLora ? ['40', 0] : ['20', 0]; // realism LoRA feeds PuLID (skipped in natural mode)
  const g = {
    '20': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: COMFY_FLUX_MODEL } }, // MODEL+CLIP+VAE
    '30': { class_type: 'PulidFluxModelLoader', inputs: { pulid_file: COMFY_PULID_MODEL } },
    '31': { class_type: 'PulidFluxEvaClipLoader', inputs: {} },
    '32': { class_type: 'PulidFluxInsightFaceLoader', inputs: { provider: 'CPU' } },
    '10': { class_type: 'LoadImage', inputs: { image: faceName } },
    // end_at 0.85: stop injecting identity for the final 15% of steps so the realism
    // LoRA can paint skin texture back in (face is already locked by step ~17/20).
    '33': { class_type: 'ApplyPulidFlux', inputs: { model: modelSrc, pulid_flux: ['30', 0], eva_clip: ['31', 0], face_analysis: ['32', 0], image: ['10', 0], weight, start_at: 0.0, end_at: 0.8 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: realPrompt, clip: ['20', 1] } },
    '24': { class_type: 'FluxGuidance', inputs: { conditioning: ['6', 0], guidance: guidance } }, // lower = more natural skin
    '25': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } },
    '12': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: steps, cfg: 1, sampler_name: 'euler', scheduler: 'beta', denoise: 1, model: ['33', 0], positive: ['24', 0], negative: ['25', 0], latent_image: ['12', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['20', 2] } },
  };
  if (useLora) {
    // Dialing the realism LoRA back from full strength lets real pores/imperfections through.
    g['40'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['20', 0], lora_name: FLUX_LORA, strength_model: loraStrength } };
  }
  if (faceDetail) {
    // FaceDetailer (Impact Pack): detect the face, re-render it through the SAME PuLID
    // model at high effective resolution (guide_size 768, denoise 0.5) with explicit
    // pore cues (wildcard) → real skin pores/detail while keeping the identity. The
    // single biggest realism fix for portraits.
    g['50'] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: FACE_BBOX_MODEL } };
    g['60'] = { class_type: 'FaceDetailer', inputs: {
      image: ['8', 0], model: ['33', 0], clip: ['20', 1], vae: ['20', 2],
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
    // Crisp zoom for catalog/sale: ESRGAN 4x then back to 2x → stays sharp when zoomed in.
    g['70'] = { class_type: 'UpscaleModelLoader', inputs: { model_name: FACE_UPSCALE_MODEL } };
    g['71'] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['70', 0], image: finalImg } };
    g['72'] = { class_type: 'ImageScaleBy', inputs: { image: ['71', 0], upscale_method: 'lanczos', scale_by: 0.5 } };
    g['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_pulid', images: ['72', 0] } };
  } else {
    g['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_pulid', images: finalImg } };
  }
  return g;
}

// Max-Realism (FLUX, text→image) — the reference-photo realism pipeline, no face ref.
// flux1-dev-fp8 → realism LoRA → photoreal prompt → low guidance → FaceDetailer(cycle)
// → 4x-UltraSharp upscale. Same knobs as the loadable ComfyUI workflow we shipped.
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

// Qwen-Image-Edit 2509 (GGUF Q8) — instruction editing that preserves identity 100%.
// GGUF UNet → Lightning-8step LoRA → AuraFlow shift → CFGNorm → QwenImageEditPlus
// text-encode (sees the source image) → KSampler from a VAEEncode of the SAME image
// (NOT an empty latent — that was the bug that produced garbage). cfg=1 with Lightning.
function qwenEditGraph(imageName, prompt, seed, opts = {}) {
  const lightning = opts.lightning !== false;
  const steps = opts.steps ?? (lightning ? 8 : 20);
  const cfg = opts.cfg ?? (lightning ? 1.0 : 2.5);
  const shift = opts.shift ?? 3.0;
  const denoise = opts.denoise ?? 1.0;
  const modelSrc = lightning ? ['41', 0] : ['37', 0];
  const g = {
    '37': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: QWEN_UNET } },
    '38': { class_type: 'CLIPLoader', inputs: { clip_name: QWEN_CLIP, type: 'qwen_image' } },
    '39': { class_type: 'VAELoader', inputs: { vae_name: QWEN_VAE } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '42': { class_type: 'ModelSamplingAuraFlow', inputs: { model: modelSrc, shift: shift } },
    '43': { class_type: 'CFGNorm', inputs: { model: ['42', 0], strength: 1.0 } },
    '6': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['38', 0], prompt: prompt, vae: ['39', 0], image1: ['10', 0] } },
    '7': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['38', 0], prompt: '', vae: ['39', 0], image1: ['10', 0] } },
    '11': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['39', 0] } },
    '3': { class_type: 'KSampler', inputs: { seed, steps: steps, cfg: cfg, sampler_name: 'euler', scheduler: 'simple', denoise: denoise, model: ['43', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['11', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['39', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'artvalue_qwen', images: ['8', 0] } },
  };
  if (lightning) {
    g['41'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['37', 0], lora_name: QWEN_LIGHTNING, strength_model: 1.0 } };
  }
  return g;
}

// Runtime check: is the PuLID-Flux custom node installed in this ComfyUI? (cached)
let pulidNodeCache = null;
export async function hasPulidNode() {
  if (pulidNodeCache !== null) return pulidNodeCache;
  if (!COMFY_URL) { pulidNodeCache = false; return false; }
  try {
    const r = await fetch(`${COMFY_URL}/object_info/ApplyPulidFlux`);
    const j = await r.json();
    pulidNodeCache = Boolean(j && j.ApplyPulidFlux);
  } catch { pulidNodeCache = false; }
  return pulidNodeCache;
}

// Runtime check: is FaceDetailer (Impact Pack) installed? Enables the photoreal-skin pass.
let faceDetailerCache = null;
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

// Runtime check: is the ESRGAN upscale model installed? Enables the crisp-zoom pass.
let upscaleCache = null;
export async function hasUpscaleModel() {
  if (upscaleCache !== null) return upscaleCache;
  if (!COMFY_URL) { upscaleCache = false; return false; }
  try {
    const r = await fetch(`${COMFY_URL}/object_info/UpscaleModelLoader`);
    const j = await r.json();
    const list = j?.UpscaleModelLoader?.input?.required?.model_name?.[0] || [];
    upscaleCache = list.includes(FACE_UPSCALE_MODEL);
  } catch { upscaleCache = false; }
  return upscaleCache;
}

// Runtime check: is the Qwen-Image-Edit GGUF stack installed? (UnetLoaderGGUF + the model)
let qwenEditCache = null;
export async function hasQwenEditNode() {
  if (qwenEditCache !== null) return qwenEditCache;
  if (!COMFY_URL) { qwenEditCache = false; return false; }
  try {
    const r = await fetch(`${COMFY_URL}/object_info/UnetLoaderGGUF`);
    const j = await r.json();
    const list = j?.UnetLoaderGGUF?.input?.required?.unet_name?.[0] || [];
    qwenEditCache = list.includes(QWEN_UNET);
  } catch { qwenEditCache = false; }
  return qwenEditCache;
}

// Max-Realism (FLUX text→image) with full knob control. Returns { src, ... }.
export async function generateMaxRealism(prompt, opts = {}) {
  if (!COMFY_URL) throw new Error('המנוע המקומי כבוי');
  const text = (prompt || '').trim();
  if (!text) throw new Error('יש להזין תיאור לתמונה');
  const faceDetail = opts.faceDetail !== false && await hasFaceDetailerNode();
  const upscale = opts.upscale !== false && await hasUpscaleModel();
  const graph = maxRealismGraph(text, rndSeed(), { ...opts, faceDetail, upscale });
  const src = await comfyWait(await comfySubmit(graph), 400);
  return { src, engine: 'local', demo: false, maxreal: true };
}

// PuLID single scene (face-identity → fresh image) with full knob control.
export async function generatePulidScene(file, prompt, opts = {}) {
  if (!file) throw new Error('יש להעלות תמונת פנים לייחוס');
  const text = (prompt || '').trim();
  if (!text) throw new Error('יש להזין תיאור לסצנה');
  const portrait = opts.portrait !== false;
  const w = opts.width ?? (portrait ? 1152 : 1536);
  const h = opts.height ?? (portrait ? 1536 : 1152);
  const weight = opts.weight ?? 0.85;
  const faceDetail = opts.faceDetail !== false && await hasFaceDetailerNode();
  const upscale = opts.upscale !== false && await hasUpscaleModel();
  const name = await uploadToComfy(file);
  const graph = pulidGraph(name, text, rndSeed(), w, h, weight, faceDetail, upscale, opts);
  const src = await comfyWait(await comfySubmit(graph), 400);
  return { src, engine: 'local', demo: false, pulid: true };
}

// Qwen-Image-Edit (instruction editing, identity-preserving) with knob control.
export async function qwenEdit(file, instruction, opts = {}) {
  if (!file) throw new Error('יש להעלות תמונה לעריכה');
  const text = (instruction || '').trim();
  if (!text) throw new Error('יש לכתוב מה לשנות בתמונה');
  if (!await hasQwenEditNode()) throw new Error('Qwen-Image-Edit אינו מותקן במנוע');
  const name = await uploadToComfy(file);
  const graph = qwenEditGraph(name, text, rndSeed(), opts);
  const src = await comfyWait(await comfySubmit(graph), 320);
  return { src, engine: 'local', demo: false, qwen: true };
}

// Curated 8-angle "model album" — the sellable product. Each angle keeps the SAME
// face (PuLID), the SAME clothing (user prompt), with the natural-skin recipe.
export const MODEL_ALBUM_ANGLES = [
  { key: 'front', kind: 'pulid', label: 'קדמי · גוף מלא', portrait: true, build: (c) => `full length head to toe shot, entire body visible, standing, facing the camera, wearing ${c}` },
  { key: 'back', kind: 'base', label: 'גב · גוף מלא', portrait: true, build: (c) => `full length head to toe shot, entire body visible, standing, photographed directly from behind, her back to the camera, face not visible, rear view, wearing ${c}` },
  { key: 'right', kind: 'pulid', label: 'צד ימין', portrait: true, build: (c) => `full length head to toe shot, standing, right three-quarter side view turned to the side, wearing ${c}` },
  { key: 'left', kind: 'pulid', label: 'צד שמאל', portrait: true, build: (c) => `full length head to toe shot, standing, left three-quarter side view turned to the side, wearing ${c}` },
  { key: 'far', kind: 'pulid', label: 'מרחוק', portrait: true, build: (c) => `very wide full body shot from a distance, standing small in the frame, facing camera, wearing ${c}` },
  { key: 'closeup', kind: 'pulid', label: 'תקריב', portrait: false, build: () => 'tight beauty close-up of the face, head and shoulders, looking at the camera' },
  { key: 'laughing', kind: 'pulid', label: 'צוחקת', portrait: false, build: (c) => `upper body, laughing happily with a big genuine smile, candid, wearing ${c}` },
  { key: 'serious', kind: 'pulid', label: 'רצינית', portrait: false, weight: 0.6, endAt: 0.5, build: (c) => `upper body, serious neutral expression, NOT smiling, calm direct gaze, wearing ${c}` },
];

// Model album: upload ONE face + a clothing/style prompt → 8 identity-consistent
// angles (PuLID), natural skin, same outfit. Streams each via onResult. Back view
// uses base-FLUX (face hidden, so PuLID's face-forward bias is irrelevant there).
export async function generateModelAlbum(file, clothing, onResult, opts = {}) {
  if (!file) throw new Error('יש להעלות תמונת דוגמנית (פנים)');
  if (!await hasPulidNode()) throw new Error('אלבום דוגמנית דורש PuLID מותקן במנוע');
  const cloth = (clothing || '').trim() || 'a simple minimalist plain lingerie set with thin straps';
  const faceDetail = opts.faceDetail !== false && await hasFaceDetailerNode();
  const upscale = opts.upscale !== false && await hasUpscaleModel();
  const name = await uploadToComfy(file);
  const angles = MODEL_ALBUM_ANGLES.slice(0, Math.max(1, Math.min(opts.count || 8, MODEL_ALBUM_ANGLES.length)));
  const baseSeed = rndSeed();
  const out = [];
  for (let i = 0; i < angles.length; i += 1) {
    const a = angles[i];
    const w = 1024;
    const h = a.portrait ? 1536 : 1280;
    const prompt = a.build(cloth);
    let graph;
    if (a.kind === 'base') {
      graph = maxRealismGraph(prompt, baseSeed + i, { natural: true, width: w, height: h, guidance: 2.6, faceDetail: false, upscale });
    } else {
      graph = pulidGraph(name, prompt, baseSeed + i, w, h, a.weight ?? 0.85, faceDetail, upscale, { natural: true, guidance: 2.6, faceDenoise: 0.4, faceGuide: a.portrait ? 896 : 1024 });
      if (a.endAt != null && graph['33']) graph['33'].inputs.end_at = a.endAt; // looser lock → expression override
    }
    // eslint-disable-next-line no-await-in-loop
    const src = await comfyWait(await comfySubmit(graph), 400);
    const r = { src, engine: 'local', demo: false, pulid: a.kind === 'pulid', album: true, angle: a.key, label: a.label, index: i };
    out.push(r);
    if (typeof onResult === 'function') { try { onResult(r, i, angles.length); } catch { /* noop */ } }
  }
  return out;
}

// Consistent-character pack via PuLID — the strongest identity lock. From ONE face
// reference, produce N brand-new scenes/poses that keep the SAME face. Uploads
// once, runs sequentially (FLUX is heavy on 16GB), streams each via onResult.
export async function characterPackPulid(file, count = 6, onResult, opts = {}) {
  if (!file) throw new Error('יש להעלות תמונת ייחוס של הדמות');
  const portrait = opts.portrait !== false;       // default portrait 1152x1536 (max facial+hair detail)
  const w = portrait ? 1152 : 1536;
  const h = portrait ? 1536 : 1152;
  const weight = opts.weight ?? 0.85;
  // Photoreal-skin pass when Impact Pack is installed (unless explicitly disabled).
  const faceDetail = opts.faceDetail !== false && await hasFaceDetailerNode();
  // Crisp-zoom upscale when an ESRGAN model is installed (unless explicitly disabled).
  const upscale = opts.upscale !== false && await hasUpscaleModel();
  const name = await uploadToComfy(file);
  const scenes = PULID_SCENES.slice(0, Math.max(1, Math.min(count, PULID_SCENES.length)));
  const out = [];
  for (let i = 0; i < scenes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const src = await comfyWait(await comfySubmit(pulidGraph(name, scenes[i], rndSeed(), w, h, weight, faceDetail, upscale)), 400);
    const r = { src, engine: 'local', demo: false, pulid: true, character: true, pose: scenes[i], index: i };
    out.push(r);
    if (typeof onResult === 'function') { try { onResult(r, i, scenes.length); } catch { /* noop */ } }
  }
  return out;
}

// Inpaint: edit only a masked region (uncensored realism SDXL). maskBlob = PNG, white = edit.
export async function inpaintImage(file, maskBlob, prompt) {
  if (!COMFY_URL) throw new Error('עריכת אזור זמינה רק עם ComfyUI מקומי');
  const text = (prompt || '').trim();
  if (!text) throw new Error('יש לכתוב מה למלא באזור המסומן');
  if (!maskBlob) throw new Error('יש לסמן אזור על התמונה (מברשת)');
  const imgName = await uploadToComfy(file);
  const maskName = await uploadToComfy(new File([maskBlob], 'mask.png', { type: 'image/png' }));
  const graph = inpaintGraph(imgName, maskName, text, rndSeed());
  const src = await comfyWait(await comfySubmit(graph), 200);
  return { src, engine: 'local', demo: false, inpaint: true };
}

// Montage: stitch several images into one slideshow clip (animated WebP).
export async function montageFromImages(blobs, opts = {}) {
  if (!COMFY_URL) throw new Error('הרכבת סרטון זמינה רק עם ComfyUI מקומי');
  if (!blobs || !blobs.length) throw new Error('בחר תמונות להרכבה');
  const fps = opts.fps || 12;
  const hold = opts.hold || 18; // frames each image is held (~1.5s at 12fps)
  const W = opts.width || 896;
  const H = opts.height || 1152;
  const names = [];
  for (let i = 0; i < blobs.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    names.push(await uploadToComfy(new File([blobs[i]], `montage_${i}.png`, { type: 'image/png' })));
  }
  const g = {};
  let combined = null;
  names.forEach((name, i) => {
    g[`l${i}`] = { class_type: 'LoadImage', inputs: { image: name } };
    g[`s${i}`] = { class_type: 'ImageScale', inputs: { image: [`l${i}`, 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' } };
    g[`r${i}`] = { class_type: 'RepeatImageBatch', inputs: { image: [`s${i}`, 0], amount: hold } };
    if (i === 0) { combined = `r${i}`; }
    else { g[`b${i}`] = { class_type: 'ImageBatch', inputs: { image1: [combined, 0], image2: [`r${i}`, 0] } }; combined = `b${i}`; }
  });
  g.save = { class_type: 'SaveAnimatedWEBP', inputs: { images: [combined, 0], filename_prefix: 'artvalue_montage', fps, lossless: false, quality: 88, method: 'default' } };
  const src = await comfyWait(await comfySubmit(g), 220);
  return { src, engine: 'local', demo: false, isVideo: true, montage: true };
}

// LTX-Video image→video — real, prompt-guided motion (stronger than SVD).
// Auto-tunes for distilled models (13B 0.9.8): ~8 steps, cfg ~1 (vs 30 / 3 for legacy).
function ltxGraph(imageName, prompt, seed, opts = {}) {
  const distilled = /distill/i.test(LTX_MODEL);
  const W = opts.width || 768;
  const H = opts.height || 512;
  const length = opts.length || 97; // 97≈4s, 153≈6s, 201≈8s at 25fps (must be 8n+1)
  const fps = opts.fps || 25;
  const steps = distilled ? 8 : 30;
  const cfg = distilled ? 1.0 : 3.0;
  const motion = (prompt || '').trim() || 'cinematic motion, natural movement, gentle camera movement, the scene comes alive';
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: LTX_MODEL } },
    '20': { class_type: 'CLIPLoader', inputs: { clip_name: LTX_CLIP, type: 'ltxv' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: motion, clip: ['20', 0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'worst quality, blurry, jittery, distorted, deformed, warping, melting, static', clip: ['20', 0] } },
    '10': { class_type: 'LoadImage', inputs: { image: imageName } },
    '15': { class_type: 'LTXVPreprocess', inputs: { image: ['10', 0], img_compression: 35 } },
    '5': { class_type: 'LTXVImgToVideo', inputs: { positive: ['6', 0], negative: ['7', 0], vae: ['4', 2], image: ['15', 0], width: W, height: H, length, batch_size: 1, strength: 1.0 } },
    '11': { class_type: 'LTXVConditioning', inputs: { positive: ['5', 0], negative: ['5', 1], frame_rate: fps } },
    '12': { class_type: 'LTXVScheduler', inputs: { steps, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1 } },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '3': { class_type: 'SamplerCustom', inputs: { model: ['4', 0], add_noise: true, noise_seed: seed, cfg, positive: ['11', 0], negative: ['11', 1], sampler: ['13', 0], sigmas: ['12', 0], latent_image: ['5', 2] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'artvalue_ltx', fps, lossless: false, quality: 90, method: 'default' } },
  };
}

export async function ltxVideo(file, prompt, opts = {}) {
  if (!COMFY_URL) throw new Error('וידאו זמין רק עם ComfyUI מקומי');
  const name = await uploadToComfy(file);
  const src = await comfyWait(await comfySubmit(ltxGraph(name, prompt, rndSeed(), opts)), 320);
  return { src, engine: 'local', demo: false, isVideo: true, ltx: true };
}

// LTX First-Last-Frame → "before/after" video. Conditions the clip on a START
// frame (frame 0) and an END frame (frame -1) via two LTXVAddGuide nodes, so the
// video morphs between them. Same distilled 13B model — no extra downloads.
// (Mirrors ComfyUI's core "First-Last-Frame to Video" workflow, minus audio.)
function flfGraph(startName, endName, prompt, seed, opts = {}) {
  const distilled = /distill/i.test(LTX_MODEL);
  const W = opts.width || 768;
  const H = opts.height || 512;
  const length = opts.length || 97;       // 97≈4s · 153≈6s · 201≈8s @25fps (8n+1)
  const fps = opts.fps || 25;
  const steps = distilled ? 8 : 30;
  const cfg = distilled ? 1.0 : 3.0;
  const strength = opts.strength ?? 0.95; // how hard to lock the two keyframes
  const motion = (prompt || '').trim() || 'smooth natural transition, the scene gradually transforms, cinematic motion';
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: LTX_MODEL } },
    '20': { class_type: 'CLIPLoader', inputs: { clip_name: LTX_CLIP, type: 'ltxv' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: motion, clip: ['20', 0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'worst quality, blurry, jittery, distorted, deformed, warping, melting, flicker', clip: ['20', 0] } },
    '10': { class_type: 'LoadImage', inputs: { image: startName } },
    '14': { class_type: 'LoadImage', inputs: { image: endName } },
    '15': { class_type: 'ImageScale', inputs: { image: ['10', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' } },
    '16': { class_type: 'ImageScale', inputs: { image: ['14', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' } },
    '21': { class_type: 'LTXVPreprocess', inputs: { image: ['15', 0], img_compression: 35 } },
    '22': { class_type: 'LTXVPreprocess', inputs: { image: ['16', 0], img_compression: 35 } },
    '5': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: W, height: H, length, batch_size: 1 } },
    '11': { class_type: 'LTXVConditioning', inputs: { positive: ['6', 0], negative: ['7', 0], frame_rate: fps } },
    '17': { class_type: 'LTXVAddGuide', inputs: { positive: ['11', 0], negative: ['11', 1], vae: ['4', 2], latent: ['5', 0], image: ['21', 0], frame_idx: 0, strength } },
    '18': { class_type: 'LTXVAddGuide', inputs: { positive: ['17', 0], negative: ['17', 1], vae: ['4', 2], latent: ['17', 2], image: ['22', 0], frame_idx: -1, strength } },
    '12': { class_type: 'LTXVScheduler', inputs: { steps, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1 } },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '3': { class_type: 'SamplerCustom', inputs: { model: ['4', 0], add_noise: true, noise_seed: seed, cfg, positive: ['18', 0], negative: ['18', 1], sampler: ['13', 0], sigmas: ['12', 0], latent_image: ['18', 2] } },
    '19': { class_type: 'LTXVCropGuides', inputs: { positive: ['18', 0], negative: ['18', 1], latent: ['3', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['19', 2], vae: ['4', 2] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'artvalue_flf', fps, lossless: false, quality: 90, method: 'default' } },
  };
}

// Before/after: upload a START frame + END frame → a clip that morphs between them.
export async function flfVideo(startFile, endFile, prompt, opts = {}) {
  if (!COMFY_URL) throw new Error('וידאו זמין רק עם ComfyUI מקומי');
  if (!startFile || !endFile) throw new Error('צריך גם תמונת התחלה וגם תמונת סיום');
  const startName = await uploadToComfy(startFile);
  const endName = await uploadToComfy(endFile);
  const src = await comfyWait(await comfySubmit(flfGraph(startName, endName, prompt, rndSeed(), opts)), 360);
  return { src, engine: 'local', demo: false, isVideo: true, ltx: true, flf: true };
}

// Image-to-video: upload one image → short animated clip (animated WebP).
export async function animateImage(file, opts = {}) {
  if (!COMFY_URL) throw new Error('אנימציה זמינה רק עם ComfyUI מקומי');
  const name = await uploadToComfy(file);
  const graph = svdGraph(name, rndSeed(), opts);
  const src = await comfyWait(await comfySubmit(graph), 320); // video is slower
  return { src, engine: 'local', demo: false, isVideo: true };
}

async function gemini(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent`;
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const inline = parts.map((p) => p.inlineData || p.inline_data).find(Boolean);
  if (!inline?.data) throw new Error('no image');
  return { src: `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`, engine: 'gemini', demo: false };
}

export async function generateImage(prompt, opts = {}) {
  const text = (prompt || '').trim();
  if (!text) throw new Error('יש להזין תיאור לתמונה');
  const useFlux = opts.arch === 'flux' || opts.quality === 'max';
  const model = opts.model || '';   // chosen checkpoint; empty → engine default
  const w = opts.width || 1024;
  const h = opts.height || 1024;
  const hd = Boolean(opts.hd);

  // Priority: local GPU (ComfyUI / A1111 — free, unlimited) → Pollinations → Gemini.
  if (COMFY_URL) {
    try { return await comfyUI(text, useFlux, w, h, hd, model); }
    catch (e) {
      const up = await checkLocalEngine();
      if (!up) throw new Error('מנוע התמונות כבוי. הפעל אותו (אייקון «Start ArtValue Image Engine» בשולחן העבודה) והמתן ~30 שניות.');
      throw new Error(`היצירה נכשלה: ${e.message}. נסה שוב — אם זה חוזר, הפעל מחדש את מנוע התמונות.`);
    }
  }
  if (LOCAL_URL) {
    try { return await localSD(text); }
    catch { throw new Error('השרת המקומי לא מגיב. ודא ש-Stable Diffusion רץ עם --api --cors-allow-origins=*'); }
  }
  if (POLLI_TOKEN) return pollinations(text);
  if (API_KEY) {
    try { return await gemini(text); } catch { /* fall through */ }
  }

  // Nothing that works is configured.
  throw new Error('יצירת תמונות אינה זמינה כרגע. אפשרויות: (1) הפעל מחולל מקומי על ה-GPU שלך, (2) הוסף מפתח Pollinations מ-enter.pollinations.ai, או (3) הפעל billing ל-Nano Banana ב-Google.');
}

export async function downloadImage(src, name = 'artvalue-nano-banana.png') {
  try {
    const r = await fetch(src);
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    URL.revokeObjectURL(u);
  } catch {
    window.open(src, '_blank');
  }
}
