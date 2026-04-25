/**
 * Initial catalog seed data — providers / models / methods.
 *
 * Each method's parametersSchema is JSON Schema draft-07. Custom annotation
 * `x-bundle-dim: true` on a top-level property marks it as part of the
 * BundleKey hash (e.g. resolution, durationSeconds, aspectRatio, mode).
 * Optional root annotation `x-bundle-unit` (PER_REQUEST | PER_SECOND | …)
 * controls the Bundle.unit on auto-creation.
 */

export interface MethodSeed {
  code: string;
  publicName: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  exampleRequest?: Record<string, unknown>;
  exampleResponse?: Record<string, unknown>;
  supportsSync?: boolean;
  supportsAsync?: boolean;
  sortOrder?: number;
}

export interface ModelSeed {
  code: string;
  publicName: string;
  description?: string;
  sortOrder?: number;
  methods: MethodSeed[];
}

export interface ProviderSeed {
  code: string;
  publicName: string;
  description: string;
  sortOrder: number;
  models: ModelSeed[];
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const callbackUrlProp = {
  type: 'string',
  format: 'uri',
  description: 'Webhook URL invoked when async task completes.',
} as const;

const promptProp = {
  type: 'string',
  minLength: 1,
  maxLength: 8000,
  description: 'Text prompt describing the desired output.',
} as const;

// --------------------------------------------------------------------------
// Banana / Gemini Image methods
// --------------------------------------------------------------------------

const bananaImageBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  resolution: {
    type: 'string',
    enum: ['0.5K', '1K', '2K', '4K'],
    'x-bundle-dim': true,
    description: 'Output image resolution tier.',
  },
  aspect_ratio: {
    type: 'string',
    enum: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    'x-bundle-dim': true,
    description: 'Output aspect ratio.',
  },
  images_count: {
    type: 'integer',
    minimum: 1,
    maximum: 4,
    default: 1,
  },
  callback_url: callbackUrlProp,
  ...extra,
});

const bananaMethods: MethodSeed[] = [
  {
    code: 'text_to_image',
    publicName: 'Text to image',
    description: 'Generate an image from a text prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: bananaImageBaseProps(),
      required: ['prompt'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'A serene mountain lake at dawn, photorealistic',
      resolution: '2K',
      aspect_ratio: '16:9',
      images_count: 1,
    },
    exampleResponse: {
      task_id: 'tsk_01H...',
      status: 'queued',
    },
  },
  {
    code: 'image_edit',
    publicName: 'Image edit',
    description: 'Edit an existing image based on a textual instruction.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: bananaImageBaseProps({
        input_images: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: { type: 'string', format: 'uri' },
          description: 'URL of the source image to edit.',
        },
      }),
      required: ['prompt', 'input_images'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Remove the background and replace with a beach scene',
      input_images: ['https://example.com/cat.jpg'],
      resolution: '1K',
      aspect_ratio: '1:1',
    },
  },
  {
    code: 'image_to_image',
    publicName: 'Image to image',
    description: 'Transform a source image into a new image guided by a prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: bananaImageBaseProps({
        input_images: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: { type: 'string', format: 'uri' },
        },
      }),
      required: ['prompt', 'input_images'],
      additionalProperties: false,
    },
  },
  {
    code: 'multi_reference_image',
    publicName: 'Multi-reference image',
    description: 'Generate an image using multiple reference images plus a prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: bananaImageBaseProps({
        input_images: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: { type: 'string', format: 'uri' },
          description: 'URLs of 2–6 reference images.',
        },
      }),
      required: ['prompt', 'input_images'],
      additionalProperties: false,
    },
  },
];

// --------------------------------------------------------------------------
// Veo methods
// --------------------------------------------------------------------------

const veoBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  resolution: {
    type: 'string',
    enum: ['720p', '1080p', '4K'],
    'x-bundle-dim': true,
  },
  duration_seconds: {
    type: 'integer',
    enum: [4, 6, 8, 10, 12],
    'x-bundle-dim': true,
    description: 'Video duration in seconds.',
  },
  aspect_ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1'],
    'x-bundle-dim': true,
  },
  videos_count: {
    type: 'integer',
    minimum: 1,
    maximum: 2,
    default: 1,
  },
  callback_url: callbackUrlProp,
  ...extra,
});

const veoMethods: MethodSeed[] = [
  {
    code: 'text_to_video',
    publicName: 'Text to video',
    description: 'Generate a short video from a text prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: veoBaseProps(),
      required: ['prompt'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'A dolphin leaping through ocean waves at sunset',
      resolution: '1080p',
      duration_seconds: 8,
      aspect_ratio: '16:9',
    },
  },
  {
    code: 'image_to_video',
    publicName: 'Image to video',
    description: 'Animate a static image into a short video.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: veoBaseProps({
        input_image_url: { type: 'string', format: 'uri' },
      }),
      required: ['prompt', 'input_image_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'video_extend',
    publicName: 'Video extend',
    description: 'Extend an existing video forward in time.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: veoBaseProps({
        input_video_url: { type: 'string', format: 'uri' },
      }),
      required: ['input_video_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'first_last_frame_to_video',
    publicName: 'First/last frame to video',
    description: 'Generate a video that interpolates between a first and a last frame.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: veoBaseProps({
        first_frame_url: { type: 'string', format: 'uri' },
        last_frame_url: { type: 'string', format: 'uri' },
      }),
      required: ['first_frame_url', 'last_frame_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'video_to_video',
    publicName: 'Video to video',
    description: 'Transform a source video stylistically based on a prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: veoBaseProps({
        input_video_url: { type: 'string', format: 'uri' },
      }),
      required: ['prompt', 'input_video_url'],
      additionalProperties: false,
    },
  },
];

// --------------------------------------------------------------------------
// Kling methods
// --------------------------------------------------------------------------

const klingVideoBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  mode: {
    type: 'string',
    enum: ['standard', 'pro'],
    'x-bundle-dim': true,
    description: 'Generation quality tier.',
  },
  duration_seconds: {
    type: 'integer',
    enum: [5, 10],
    'x-bundle-dim': true,
  },
  resolution: {
    type: 'string',
    enum: ['720p', '1080p'],
    'x-bundle-dim': true,
  },
  aspect_ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1'],
    'x-bundle-dim': true,
  },
  videos_count: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
  callback_url: callbackUrlProp,
  ...extra,
});

const klingMethods: MethodSeed[] = [
  {
    code: 'text_to_video',
    publicName: 'Text to video',
    description: 'Generate a video from a text prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: klingVideoBaseProps(),
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    code: 'image_to_video',
    publicName: 'Image to video',
    description: 'Animate an image into a short video.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: klingVideoBaseProps({
        input_images: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: { type: 'string', format: 'uri' },
        },
      }),
      required: ['prompt', 'input_images'],
      additionalProperties: false,
    },
  },
  {
    code: 'image_generation',
    publicName: 'Image generation',
    description: 'Generate one or more images from a text prompt.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: promptProp,
        mode: {
          type: 'string',
          enum: ['standard', 'pro'],
          'x-bundle-dim': true,
        },
        resolution: {
          type: 'string',
          enum: ['1K', '2K'],
          'x-bundle-dim': true,
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16'],
          'x-bundle-dim': true,
        },
        images_count: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
        callback_url: callbackUrlProp,
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    code: 'video_effect',
    publicName: 'Video effect',
    description: 'Apply a predefined cinematic effect to a video.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        effect_code: { type: 'string', minLength: 1 },
        input_video_url: { type: 'string', format: 'uri' },
        callback_url: callbackUrlProp,
      },
      required: ['effect_code', 'input_video_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'video_extend',
    publicName: 'Video extend',
    description: 'Extend an existing video forward in time.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: klingVideoBaseProps({
        input_video_url: { type: 'string', format: 'uri' },
      }),
      required: ['input_video_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'virtual_try_on',
    publicName: 'Virtual try-on',
    description: 'Place a clothing/product image onto a person image.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        person_image_url: { type: 'string', format: 'uri' },
        product_image_url: { type: 'string', format: 'uri' },
        callback_url: callbackUrlProp,
      },
      required: ['person_image_url', 'product_image_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'lip_sync',
    publicName: 'Lip sync',
    description: 'Sync lip movements of a video to an audio clip.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        input_video_url: { type: 'string', format: 'uri' },
        audio_url: { type: 'string', format: 'uri' },
        callback_url: callbackUrlProp,
      },
      required: ['input_video_url', 'audio_url'],
      additionalProperties: false,
    },
  },
  {
    code: 'tts',
    publicName: 'Text-to-speech',
    description: 'Synthesize speech audio from text.',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 5000 },
        voice_id: { type: 'string' },
        language: { type: 'string', minLength: 2, maxLength: 8 },
        callback_url: callbackUrlProp,
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

// --------------------------------------------------------------------------
// Providers
// --------------------------------------------------------------------------

export const initialCatalog: ProviderSeed[] = [
  {
    code: 'google_banana',
    publicName: 'Google Banana / Gemini Image',
    description:
      'Google’s Gemini-powered image generation and editing models (Nano Banana family).',
    sortOrder: 10,
    models: [
      {
        code: 'gemini-3.1-flash-image-preview',
        publicName: 'Nano Banana 2',
        description: 'Fast, high-quality general-purpose image generation.',
        sortOrder: 10,
        methods: bananaMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'gemini-3-pro-image-preview',
        publicName: 'Nano Banana Pro',
        description: 'Pro-tier image generation with stronger prompt fidelity.',
        sortOrder: 20,
        methods: bananaMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
    ],
  },
  {
    code: 'google_veo',
    publicName: 'Google Veo',
    description:
      'Google Veo video generation models (3.0 and 3.1 generation, fast and lite variants).',
    sortOrder: 20,
    models: [
      {
        code: 'veo-3.0-generate-001',
        publicName: 'Veo 3.0',
        sortOrder: 10,
        methods: veoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'veo-3.0-fast-generate-001',
        publicName: 'Veo 3.0 Fast',
        sortOrder: 20,
        methods: veoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'veo-3.1-generate-preview',
        publicName: 'Veo 3.1',
        sortOrder: 30,
        methods: veoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'veo-3.1-fast-generate-preview',
        publicName: 'Veo 3.1 Fast',
        sortOrder: 40,
        methods: veoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'veo-3.1-lite-generate-preview',
        publicName: 'Veo 3.1 Lite',
        sortOrder: 50,
        methods: veoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
    ],
  },
  {
    code: 'kling_ai',
    publicName: 'Kling AI',
    description:
      'Kling AI video and image generation suite (text/image to video, virtual try-on, lip sync, TTS).',
    sortOrder: 30,
    models: [
      {
        code: 'kling-2.6',
        publicName: 'Kling 2.6',
        sortOrder: 10,
        methods: klingMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'kling-v3',
        publicName: 'Kling V3',
        sortOrder: 20,
        methods: klingMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'kling-o1',
        publicName: 'Kling O1',
        sortOrder: 30,
        methods: klingMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
    ],
  },
];
