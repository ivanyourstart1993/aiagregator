// Playground preset catalog — the curated subset of catalog SKUs surfaced in
// the Generate UI. Extracted from PlaygroundClient.tsx so it can be imported
// by both the client component and the catalog-consistency validator
// (scripts/check-catalog-presets.mjs) without pulling in JSX/React.

export type TaskType =
  | 'text_to_image_flash_1k'
  | 'text_to_image_flash_2k'
  | 'text_to_image_pro_2k'
  | 'image_edit_flash_1k'
  | 'image_edit_pro_2k'
  | 'multi_reference_pro_2k'
  | 'text_to_image_gptimage_low_1k'
  | 'text_to_image_gptimage_med_1k'
  | 'text_to_image_gptimage_high_1k'
  | 'text_to_image_gptimage2_low_1k'
  | 'text_to_image_gptimage2_med_1k'
  | 'text_to_image_gptimage2_high_1k'
  | 'text_to_image_gptimage2_med_2k'
  | 'text_to_image_gptimage2_high_4k'
  | 'text_to_image_dalle3_std'
  | 'text_to_image_dalle3_hd'
  | 'image_edit_gptimage_med_1k'
  | 'image_edit_gptimage2_med_1k'
  | 'text_to_video_fast_1080p'
  | 'text_to_video_quality_1080p'
  | 'text_to_video_kling_std'
  | 'text_to_video_kling_pro'
  | 'text_to_video_kling16_std'
  | 'text_to_video_kling16_pro'
  | 'text_to_video_kling21m_pro'
  | 'text_to_video_kling25_pro'
  | 'text_to_video_klingv3_std'
  | 'text_to_video_klingv3_pro'
  | 'motion_control_klingv3_std'
  | 'motion_control_klingv3_pro'
  | 'motion_control_kling26_std'
  | 'motion_control_kling26_pro'
  | 'lip_sync_klingv3'
  | 'text_to_video_seedance_lite_720p'
  | 'text_to_video_seedance_pro_720p'
  | 'text_to_video_seedance_pro_1080p'
  | 'text_to_video_or_seedance2_fast_720p'
  | 'text_to_video_or_seedance2_pro_720p'
  | 'text_to_video_or_seedance2_pro_1080p'
  | 'text_to_video_or_seedance15_pro_1080p'
  | 'text_gen_pro'
  | 'text_gen_flash'
  | 'text_gen_flash_lite'
  | 'embed_004';

export interface PresetSpec {
  provider: string;
  model: string;
  // Output kind. Drives which form controls render and how the result is
  // displayed. Defaults to 'image' for back-compat with existing presets.
  kind?: 'image' | 'video' | 'text' | 'embedding';
  // Default method when no input image is attached. For video presets,
  // an attached image switches the call to imageMethod automatically.
  method: string;
  imageMethod?: string; // image_to_video, etc.
  resolution?: string;
  durationOptions?: number[]; // shows duration buttons; first is default
  // Base duration the `approxUsd` price refers to. Cost shown to the user
  // is `approxUsd * (duration / durationBase)`. Veo: 8s, Kling: 5s.
  durationBase?: number;
  // Provider-specific quality/mode tier. Forwarded verbatim into params.mode
  // so the bundle key hash matches the seeded prices. Examples:
  //   Kling: 'standard' | 'pro'
  //   OpenAI gpt-image-1: 'low' | 'medium' | 'high'
  //   OpenAI dall-e-3: 'standard' | 'hd'
  mode?: string;
  needsImage?: boolean;
  needsVideo?: true;
  // Motion Control needs a reference motion video (URL) in addition to the
  // character image. Shows a reference-video URL field and sends
  // params.reference_video.
  needsReferenceVideo?: true;
  // Override for the input-image cap. Defaults to MAX_INPUT_IMAGES (6); set
  // higher for models that accept more (gpt-image-2 takes up to 16).
  maxInputImages?: number;
  // Display price — UX-only estimate, the real cost is decided
  // server-side at admit time.
  approxUsd: number;
}

// approxUsd values reflect current Default Tariff pricing in the DB.
// Source: TariffBundlePrice rows for each (provider, model, method, mode,
// resolution) combination. Kept in sync manually for now; future: switch
// to a server-fetched price preview per preset.
export const PRESETS: Record<TaskType, PresetSpec> = {
  text_to_image_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '1K',
    approxUsd: 0.02,
  },
  text_to_image_flash_2k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.025,
  },
  text_to_image_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.0495,
  },
  image_edit_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'image_edit',
    resolution: '1K',
    needsImage: true,
    // image_edit schema is input_images maxItems:1 — accept a single source
    // image, else the request fails catalog validation. Combining several
    // images is a separate method (multi_reference_image) below.
    maxInputImages: 1,
    approxUsd: 0.024,
  },
  image_edit_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'image_edit',
    resolution: '2K',
    needsImage: true,
    maxInputImages: 1,
    approxUsd: 0.0594,
  },
  // Nano Banana Pro multi-reference: combine 2–6 source images into one,
  // guided by a prompt (e.g. put the subject from photo 1 into the scene of
  // photo 2). Distinct from image_edit, whose schema caps input_images at 1.
  multi_reference_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'multi_reference_image',
    resolution: '2K',
    needsImage: true,
    approxUsd: 0.0594,
  },
  // OpenAI Images. `mode` carries quality (gpt-image-1: low/medium/high;
  // dall-e-3: standard/hd) — sent as params.mode so the bundle key matches
  // the seeded TariffBundlePrice rows.
  text_to_image_gptimage_low_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'low',
    approxUsd: 0.013,
  },
  text_to_image_gptimage_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'medium',
    approxUsd: 0.0483,
  },
  text_to_image_gptimage_high_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'high',
    approxUsd: 0.1921,
  },
  text_to_image_dalle3_std: {
    provider: 'openai_image',
    model: 'dall-e-3',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'standard',
    approxUsd: 0.046,
  },
  text_to_image_dalle3_hd: {
    provider: 'openai_image',
    model: 'dall-e-3',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'hd',
    approxUsd: 0.092,
  },
  image_edit_gptimage_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'image_edit',
    resolution: '1024x1024',
    mode: 'medium',
    needsImage: true,
    approxUsd: 0.0483,
  },
  // gpt-image-2 — flagship OpenAI image model (Apr 2026). Reasoning-based
  // composition, multilingual text rendering, up to 3840px long edge, up
  // to 16 input images for composite edits. Prices match seeded
  // OPENAI_IMAGE_PRICES (raw OpenAI cost + ~15% margin).
  text_to_image_gptimage2_low_1k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'low',
    approxUsd: 0.0069,
  },
  text_to_image_gptimage2_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'medium',
    approxUsd: 0.061,
  },
  text_to_image_gptimage2_high_1k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'high',
    approxUsd: 0.243,
  },
  text_to_image_gptimage2_med_2k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'text_to_image',
    resolution: '2048x2048',
    mode: 'medium',
    approxUsd: 0.244,
  },
  text_to_image_gptimage2_high_4k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'text_to_image',
    resolution: '3840x2160',
    mode: 'high',
    approxUsd: 2.04,
  },
  image_edit_gptimage2_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-2',
    method: 'image_edit',
    resolution: '1024x1024',
    mode: 'medium',
    needsImage: true,
    maxInputImages: 16,
    approxUsd: 0.061,
  },
  text_to_video_fast_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-fast-generate-001',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [4, 6, 8],
    durationBase: 8,
    needsVideo: true,
    approxUsd: 0.35, // $0.04375/s × 8s
  },
  text_to_video_quality_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-generate-001',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [4, 6, 8],
    durationBase: 8,
    needsVideo: true,
    approxUsd: 3.2, // $0.40/s × 8s — sized for ~$120 profit per coupon
  },
  // Kling: resolution is part of the bundle key (per the seed table) and
  // is implied by the mode — standard=720p, pro=1080p. We send it explicitly
  // so the runtime bundleKey matches the seeded TariffBundlePrice.
  text_to_video_kling_std: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.56,
  },
  text_to_video_kling_pro: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 1.12,
  },
  text_to_video_kling16_std: {
    provider: 'kling_ai',
    model: 'kling-v1-6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.14,
  },
  text_to_video_kling16_pro: {
    provider: 'kling_ai',
    model: 'kling-v1-6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.49,
  },
  text_to_video_kling21m_pro: {
    provider: 'kling_ai',
    model: 'kling-v2-1-master',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.7,
  },
  text_to_video_kling25_pro: {
    provider: 'kling_ai',
    model: 'kling-v2-5-turbo',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.45,
  },
  text_to_video_klingv3_std: {
    provider: 'kling_ai',
    model: 'kling-v3',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.42,
  },
  text_to_video_klingv3_pro: {
    provider: 'kling_ai',
    model: 'kling-v3',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.56,
  },
  // Kling Motion Control — transfers motion from a reference video onto a
  // character image. Needs BOTH a character image (input_image) and a
  // reference video (reference_video URL). Billed PER_SECOND; approxUsd is the
  // 5s reference cost (std $0.097/s, pro $0.129/s). `mode` carries std/pro so
  // the bundle key matches the seeded PER_SECOND prices.
  motion_control_klingv3_std: {
    provider: 'kling_ai',
    model: 'kling-v3',
    kind: 'video',
    method: 'motion_control',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsImage: true,
    maxInputImages: 1,
    needsVideo: true,
    needsReferenceVideo: true,
    approxUsd: 0.485,
  },
  motion_control_klingv3_pro: {
    provider: 'kling_ai',
    model: 'kling-v3',
    kind: 'video',
    method: 'motion_control',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsImage: true,
    maxInputImages: 1,
    needsVideo: true,
    needsReferenceVideo: true,
    approxUsd: 0.645,
  },
  motion_control_kling26_std: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    kind: 'video',
    method: 'motion_control',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsImage: true,
    maxInputImages: 1,
    needsVideo: true,
    needsReferenceVideo: true,
    approxUsd: 0.485,
  },
  motion_control_kling26_pro: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    kind: 'video',
    method: 'motion_control',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsImage: true,
    maxInputImages: 1,
    needsVideo: true,
    needsReferenceVideo: true,
    approxUsd: 0.645,
  },
  // Lip Sync — re-animates the mouth of a person in a source video to speak.
  // The playground exposes the text2video mode: source video + spoken text
  // (reuses the prompt box) + a TTS voice. audio2video is API-only. Flat
  // PER_REQUEST price, so no duration/mode dimensions here.
  lip_sync_klingv3: {
    provider: 'kling_ai',
    model: 'kling-v3',
    kind: 'video',
    method: 'lip_sync',
    needsReferenceVideo: true,
    approxUsd: 0.2,
  },
  // Seedance. params.mode is overridden to the methodCode at submit time
  // (same convention as Veo) so the bundle key distinguishes t2v from i2v.
  text_to_video_seedance_lite_720p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-lite-t2v-250428',
    method: 'text_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.125, // $0.025/s × 5s
  },
  text_to_video_seedance_pro_720p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-pro-250528',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.26, // $0.052/s × 5s
  },
  text_to_video_seedance_pro_1080p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-pro-250528',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.585, // $0.117/s × 5s
  },
  // OpenRouter-routed Seedance 2.0 family. Same API key powers all three;
  // bundle prices seeded in packages/db/prisma/seed.ts (OPENROUTER_PRICES).
  // 2.0 Fast caps at 720p; 2.0 and 1.5 Pro reach 1080p.
  text_to_video_or_seedance2_fast_720p: {
    provider: 'seedance',
    model: 'openrouter-seedance-2-0-fast',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.85, // $0.17/s × 5s
  },
  text_to_video_or_seedance2_pro_720p: {
    provider: 'seedance',
    model: 'openrouter-seedance-2-0',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 1.05, // $0.21/s × 5s
  },
  text_to_video_or_seedance2_pro_1080p: {
    provider: 'seedance',
    model: 'openrouter-seedance-2-0',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 2.25, // $0.45/s × 5s
  },
  text_to_video_or_seedance15_pro_1080p: {
    provider: 'seedance',
    model: 'openrouter-seedance-1-5-pro',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.85, // $0.17/s × 5s
  },
  // Gemini 2.5 family — text generation via Vertex AI. PER_REQUEST tier
  // for predictable playground cost; reconciliation against per-token
  // pricing happens server-side at admit time.
  text_gen_pro: {
    provider: 'google_banana',
    model: 'gemini-2.5-pro',
    kind: 'text',
    method: 'text_generation',
    approxUsd: 0.025,
  },
  text_gen_flash: {
    provider: 'google_banana',
    model: 'gemini-2.5-flash',
    kind: 'text',
    method: 'text_generation',
    approxUsd: 0.003,
  },
  text_gen_flash_lite: {
    provider: 'google_banana',
    model: 'gemini-2.5-flash-lite',
    kind: 'text',
    method: 'text_generation',
    approxUsd: 0.002,
  },
  embed_004: {
    provider: 'google_banana',
    model: 'text-embedding-004',
    kind: 'embedding',
    method: 'embedding',
    approxUsd: 0.001,
  },
};

export const TASK_GROUPS: Array<{ labelKey: string; types: TaskType[] }> = [
  {
    labelKey: 'groupImageGen',
    types: ['text_to_image_flash_1k', 'text_to_image_flash_2k', 'text_to_image_pro_2k'],
  },
  {
    labelKey: 'groupImageGptImage2',
    types: [
      'text_to_image_gptimage2_low_1k',
      'text_to_image_gptimage2_med_1k',
      'text_to_image_gptimage2_high_1k',
      'text_to_image_gptimage2_med_2k',
      'text_to_image_gptimage2_high_4k',
    ],
  },
  {
    labelKey: 'groupImageOpenAI',
    types: [
      'text_to_image_gptimage_low_1k',
      'text_to_image_gptimage_med_1k',
      'text_to_image_gptimage_high_1k',
      'text_to_image_dalle3_std',
      'text_to_image_dalle3_hd',
    ],
  },
  {
    labelKey: 'groupImageEdit',
    types: [
      'image_edit_flash_1k',
      'image_edit_pro_2k',
      'multi_reference_pro_2k',
      'image_edit_gptimage_med_1k',
      'image_edit_gptimage2_med_1k',
    ],
  },
  {
    labelKey: 'groupVideoVeo',
    types: ['text_to_video_fast_1080p', 'text_to_video_quality_1080p'],
  },
  {
    labelKey: 'groupVideoKling',
    types: [
      'text_to_video_kling16_std',
      'text_to_video_kling16_pro',
      'text_to_video_kling_std',
      'text_to_video_kling_pro',
      'text_to_video_klingv3_std',
      'text_to_video_klingv3_pro',
      'text_to_video_kling21m_pro',
      'text_to_video_kling25_pro',
      'motion_control_klingv3_std',
      'motion_control_klingv3_pro',
      'motion_control_kling26_std',
      'motion_control_kling26_pro',
      'lip_sync_klingv3',
    ],
  },
  // Direct Seedance (BytePlus) is intentionally not exposed here: BytePlus
  // requires per-account model activation in their ARK Console, and the
  // OpenRouter route covers the same model family with pre-activated access.
  // The catalog rows + adapter for `seedance` provider stay in place so
  // external API clients who activated their BytePlus account can still
  // call /v1/generations directly.
  {
    labelKey: 'groupVideoSeedance',
    types: [
      'text_to_video_or_seedance2_fast_720p',
      'text_to_video_or_seedance2_pro_720p',
      'text_to_video_or_seedance2_pro_1080p',
      'text_to_video_or_seedance15_pro_1080p',
    ],
  },
  {
    labelKey: 'groupGeminiText',
    types: ['text_gen_pro', 'text_gen_flash', 'text_gen_flash_lite', 'embed_004'],
  },
];
