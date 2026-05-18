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
    exampleRequest: {
      prompt: 'Make this photo look like an oil painting, impressionist style',
      input_images: ['https://example.com/portrait.jpg'],
      resolution: '2K',
      aspect_ratio: '1:1',
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
    exampleRequest: {
      prompt: 'Combine the subject from the first reference with the style of the second',
      input_images: [
        'https://example.com/subject.jpg',
        'https://example.com/style-ref.jpg',
      ],
      resolution: '2K',
      aspect_ratio: '1:1',
    },
  },
];

// --------------------------------------------------------------------------
// Gemini text methods (chat completion, structured output, function calling)
// + text embeddings. Shares the google_banana provider — same API key, just
// different model codes and endpoints (:generateContent vs :embedContent on
// AI Studio; equivalently Vertex AI for SA-credentialled accounts).
//
// Pricing note (v1): metered at PER_REQUEST flat with a per-call cap. Token
// reconciliation (PER_TOKEN_INPUT + PER_TOKEN_OUTPUT) is a planned upgrade
// — meanwhile the adapter records usage in `meta.usage` for audit. For
// large-volume embedding workloads contact support.
// --------------------------------------------------------------------------

// Subset of the OpenAI-style ChatCompletion message shape. We accept the same
// roles Gemini understands so existing OpenAI client code is easy to port.
const chatMessageSchema = {
  type: 'object',
  required: ['role', 'content'],
  properties: {
    role: {
      type: 'string',
      enum: ['system', 'user', 'assistant', 'tool'],
    },
    content: {
      oneOf: [
        { type: 'string' },
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['text', 'image_url'] },
              text: { type: 'string' },
              image_url: {
                type: 'object',
                properties: { url: { type: 'string', format: 'uri' } },
              },
            },
          },
        },
      ],
    },
    name: { type: 'string' },
    tool_call_id: { type: 'string' },
  },
} as const;

const toolDefinitionSchema = {
  type: 'object',
  required: ['type', 'function'],
  properties: {
    type: { type: 'string', enum: ['function'] },
    function: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        parameters: { type: 'object', description: 'JSON Schema for function arguments.' },
      },
    },
  },
} as const;

const geminiTextMethods: MethodSeed[] = [
  {
    code: 'text_generation',
    publicName: 'Text generation (chat completion)',
    description:
      'Chat-style text completion with the Gemini 2.5 family. Supports system/user/assistant messages, structured JSON output (response_schema), and function calling (tools). Compatible with the OpenAI ChatCompletion request shape for easy migration.',
    supportsSync: true,
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_REQUEST',
      properties: {
        messages: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: chatMessageSchema,
          description:
            'Chat history. Provide either `messages` OR `prompt`; if both are present `messages` wins.',
        },
        prompt: {
          type: 'string',
          maxLength: 200_000,
          description:
            'Convenience alternative to `messages`: a single user turn. Ignored when `messages` is set.',
        },
        system_instruction: {
          type: 'string',
          maxLength: 32_000,
          description:
            'System-level guidance prepended to the prompt (separate from the messages array).',
        },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 1 },
        top_p: { type: 'number', minimum: 0, maximum: 1 },
        top_k: { type: 'integer', minimum: 1, maximum: 100 },
        max_output_tokens: { type: 'integer', minimum: 1, maximum: 65_535 },
        stop_sequences: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 5,
        },
        response_mime_type: {
          type: 'string',
          enum: ['text/plain', 'application/json'],
          description:
            'Force the model to emit JSON when set to "application/json". Pair with `response_schema` for strict structured output.',
        },
        response_schema: {
          type: 'object',
          description:
            'JSON Schema (draft-07 subset) the response must conform to. Implies `response_mime_type=application/json`.',
        },
        tools: {
          type: 'array',
          items: toolDefinitionSchema,
          maxItems: 32,
          description:
            'Function-calling: list of tools the model may invoke. The response contains tool_calls in `meta.tool_calls`.',
        },
        tool_choice: {
          oneOf: [
            { type: 'string', enum: ['auto', 'none', 'required'] },
            {
              type: 'object',
              required: ['type', 'function'],
              properties: {
                type: { type: 'string', enum: ['function'] },
                function: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } },
                },
              },
            },
          ],
        },
        callback_url: callbackUrlProp,
      },
      additionalProperties: false,
    },
    exampleRequest: {
      messages: [
        { role: 'system', content: 'You are a helpful product catalog assistant.' },
        { role: 'user', content: 'Find SKU "6204-2RS" and return its specs as JSON.' },
      ],
      response_mime_type: 'application/json',
      response_schema: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          name: { type: 'string' },
          inner_diameter_mm: { type: 'number' },
          outer_diameter_mm: { type: 'number' },
          width_mm: { type: 'number' },
        },
        required: ['sku'],
      },
      temperature: 0.2,
      max_output_tokens: 512,
    },
    exampleResponse: {
      task_id: 'tsk_01H...',
      status: 'queued',
    },
  },
  {
    code: 'embedding',
    publicName: 'Text embedding',
    description:
      'Generate a dense vector embedding for a piece of text. Useful for semantic search, classification, RAG, and recommendation. Input may be a single string or an array (batch). Returns one vector per input in `meta.embeddings`.',
    supportsSync: true,
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_REQUEST',
      properties: {
        input: {
          oneOf: [
            { type: 'string', minLength: 1, maxLength: 200_000 },
            {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: { type: 'string', minLength: 1, maxLength: 200_000 },
              description:
                'Batch up to 100 inputs per call. For larger jobs make multiple calls — a true batch endpoint is on the roadmap.',
            },
          ],
          description: 'The text(s) to embed.',
        },
        task_type: {
          type: 'string',
          enum: [
            'RETRIEVAL_QUERY',
            'RETRIEVAL_DOCUMENT',
            'SEMANTIC_SIMILARITY',
            'CLASSIFICATION',
            'CLUSTERING',
            'QUESTION_ANSWERING',
            'FACT_VERIFICATION',
            'CODE_RETRIEVAL_QUERY',
          ],
          default: 'RETRIEVAL_DOCUMENT',
          description:
            'Hint to the embedding model about the downstream use case. Improves retrieval quality.',
        },
        title: {
          type: 'string',
          maxLength: 4_000,
          description:
            'Optional document title — only used when task_type=RETRIEVAL_DOCUMENT.',
        },
        output_dimensionality: {
          type: 'integer',
          minimum: 8,
          maximum: 768,
          description:
            'Truncate the output vector to N dimensions (default: model native — 768).',
        },
        callback_url: callbackUrlProp,
      },
      required: ['input'],
      additionalProperties: false,
    },
    exampleRequest: {
      input: [
        'SKF 6204-2RS deep groove ball bearing, 20mm bore, ZZ shielded',
        'NSK 6205-RS sealed bearing 25mm bore',
      ],
      task_type: 'RETRIEVAL_DOCUMENT',
      output_dimensionality: 768,
    },
    exampleResponse: {
      task_id: 'tsk_01H...',
      status: 'queued',
    },
  },
];

// --------------------------------------------------------------------------
// Veo methods
// --------------------------------------------------------------------------

const veoBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  // `mode` distinguishes text_to_video from image_to_video at the bundle
  // level so seed prices (different per task type per resolution) line up
  // with runtime bundleKeys. The frontend mirrors `method` into `params.mode`.
  mode: {
    type: 'string',
    enum: ['text_to_video', 'image_to_video'],
    'x-bundle-dim': true,
    description: 'Internal task-type marker (matches the method code).',
  },
  resolution: {
    type: 'string',
    enum: ['720p', '1080p', '4K'],
    'x-bundle-dim': true,
  },
  duration_seconds: {
    type: 'integer',
    enum: [4, 6, 8, 10, 12],
    description: 'Video duration in seconds. Pricing is PER_SECOND, so the duration is NOT part of the bundle key — total cost = perSecondUnits × duration.',
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
    exampleRequest: {
      prompt: 'Camera slowly pans around the scene with cinematic lighting',
      input_image_url: 'https://example.com/start-frame.jpg',
      resolution: '1080p',
      duration_seconds: 8,
      aspect_ratio: '16:9',
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
    exampleRequest: {
      input_video_url: 'https://example.com/source.mp4',
      duration_seconds: 4,
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
    exampleRequest: {
      first_frame_url: 'https://example.com/start.jpg',
      last_frame_url: 'https://example.com/end.jpg',
      duration_seconds: 6,
      resolution: '1080p',
      aspect_ratio: '16:9',
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
    exampleRequest: {
      prompt: 'Restyle as a noir black-and-white scene with rain',
      input_video_url: 'https://example.com/source.mp4',
      duration_seconds: 8,
      resolution: '1080p',
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
  // aspect_ratio is forwarded to Kling but is NOT a pricing dimension —
  // tariff entries for kling are identical across ratios (see seedKlingPrices
  // in packages/db/prisma/seed.ts which writes aspectRatio: null). Marking it
  // x-bundle-dim makes the runtime bundleKey diverge from seed and surface
  // as price_not_configured.
  aspect_ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1'],
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
      required: ['prompt', 'mode', 'duration_seconds', 'resolution'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'A red sports car drifting around a mountain curve at sunset, cinematic',
      mode: 'pro',
      duration_seconds: 5,
      resolution: '1080p',
      aspect_ratio: '16:9',
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
      required: ['prompt', 'input_images', 'mode', 'duration_seconds', 'resolution'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Subject turns their head slightly, light wind in their hair',
      input_images: ['https://example.com/portrait.jpg'],
      mode: 'pro',
      duration_seconds: 5,
      resolution: '1080p',
      aspect_ratio: '9:16',
    },
  },
  // NOTE: Kling AI exposes many other endpoints upstream (image_generation,
  // video_effect, video_extend, virtual_try_on, lip_sync, tts) — those used
  // to be listed here too, but the worker adapter only implements
  // text_to_video / image_to_video (SUPPORTED_METHODS in apps/worker/.../
  // kling-ai.ts). Listing the others in the catalog leaks them into /docs
  // and /api-explorer as if they were callable, then admit fails with
  // provider_not_implemented when a client actually tries. Restore them
  // here only when the adapter learns the corresponding endpoint.
];

// --------------------------------------------------------------------------
// Seedance (Bytedance Volcano Engine) methods
// --------------------------------------------------------------------------

const seedanceVideoBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  // Mirrors the Veo convention: `mode` carries the task-type so the bundle
  // key for text_to_video and image_to_video stays distinct even though
  // both methods map to the same BundleMethod (VIDEO_GENERATION).
  mode: {
    type: 'string',
    enum: ['text_to_video', 'image_to_video'],
    'x-bundle-dim': true,
    description: 'Internal task-type marker (matches the method code).',
  },
  resolution: {
    type: 'string',
    enum: ['480p', '720p', '1080p'],
    'x-bundle-dim': true,
    description: 'Output resolution tier. Lite SKUs cap at 720p; Pro supports 1080p.',
  },
  duration_seconds: {
    type: 'integer',
    enum: [5, 10],
    description: 'Video duration in seconds. PER_SECOND pricing — duration is not part of the bundle key.',
  },
  aspect_ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    description: 'Output aspect ratio (passed inline to Seedance as a --ratio switch).',
  },
  callback_url: callbackUrlProp,
  ...extra,
});

const seedanceMethods: MethodSeed[] = [
  {
    code: 'text_to_video',
    publicName: 'Text to video',
    description: 'Generate a short video from a text prompt (Seedance Doubao).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: seedanceVideoBaseProps(),
      required: ['prompt'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'A neon-lit Tokyo street at night, light rain reflections',
      resolution: '1080p',
      duration_seconds: 5,
      aspect_ratio: '16:9',
    },
  },
  {
    code: 'image_to_video',
    publicName: 'Image to video',
    description: 'Animate a static image into a short video (Seedance Doubao).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: seedanceVideoBaseProps({
        image: {
          type: 'string',
          description: 'Source image URL (https://) or data: URI.',
        },
      }),
      required: ['image'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Camera slowly zooms in, subtle ambient motion, broadcast aesthetics',
      image: 'https://example.com/first-frame.jpg',
      resolution: '1080p',
      duration_seconds: 5,
      aspect_ratio: '16:9',
    },
  },
];

// --------------------------------------------------------------------------
// OpenAI Images methods
// --------------------------------------------------------------------------

const openaiImageBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  // Quality tier — naming differs per model (gpt-image-1: low/medium/high/auto;
  // dall-e-3: standard/hd; dall-e-2 ignores). Exposed under `mode` so it gets
  // hashed into the bundle key.
  mode: {
    type: 'string',
    enum: ['auto', 'low', 'medium', 'high', 'standard', 'hd'],
    'x-bundle-dim': true,
    description:
      'Quality tier. gpt-image-2 and gpt-image-1: low | medium | high | auto. dall-e-3: standard | hd. dall-e-2: ignored.',
  },
  resolution: {
    type: 'string',
    enum: [
      'auto',
      '256x256',
      '512x512',
      '1024x1024',
      '1024x1536',
      '1536x1024',
      '1024x1792',
      '1792x1024',
      '2048x2048',
      '3840x2160',
      '2160x3840',
    ],
    'x-bundle-dim': true,
    description:
      'Output size. gpt-image-2: 1024x1024 | 1024x1536 | 1536x1024 | 2048x2048 | 3840x2160 | 2160x3840 | auto. gpt-image-1: 1024x1024 | 1024x1536 | 1536x1024 | auto. dall-e-3: 1024x1024 | 1024x1792 | 1792x1024. dall-e-2: 256x256 | 512x512 | 1024x1024.',
  },
  images_count: {
    type: 'integer',
    minimum: 1,
    maximum: 10,
    default: 1,
    description: 'Number of images to generate. dall-e-3 must be 1.',
  },
  // Not a bundle dim — OpenAI's image API expresses aspect ratio via `size`,
  // not a free-form ratio. Accepted to keep parity with the playground's
  // shared aspect-ratio picker, but ignored by the adapter.
  aspect_ratio: {
    type: 'string',
    enum: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    description: 'Cosmetic; OpenAI selects rendering size from `resolution`.',
  },
  callback_url: callbackUrlProp,
  ...extra,
});

const openaiImageMethods: MethodSeed[] = [
  {
    code: 'text_to_image',
    publicName: 'Text to image',
    description: 'Generate an image from a text prompt (OpenAI Images API).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: openaiImageBaseProps({
        // dall-e-3 only
        style: {
          type: 'string',
          enum: ['vivid', 'natural'],
          description: 'dall-e-3 only: rendering style.',
        },
        // Native GPT-Image family (gpt-image-1, gpt-image-2)
        background: {
          type: 'string',
          enum: ['auto', 'transparent', 'opaque'],
          description: 'gpt-image-1 / gpt-image-2 only: background handling.',
        },
      }),
      required: ['prompt'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'A studio-photo close-up of a glass of cold espresso, dramatic side lighting',
      resolution: '1024x1024',
      mode: 'medium',
      images_count: 1,
    },
  },
  {
    code: 'image_edit',
    publicName: 'Image edit',
    description: 'Edit an existing image guided by a prompt (gpt-image-1 and dall-e-2).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: openaiImageBaseProps({
        input_images: {
          type: 'array',
          minItems: 1,
          maxItems: 16,
          items: { type: 'string', format: 'uri' },
          description:
            'Source images. dall-e-2 accepts exactly one PNG; gpt-image-1 supports up to 6 inputs for composite edits; gpt-image-2 raises the cap to 16.',
        },
        mask: {
          type: 'string',
          format: 'uri',
          description: 'Optional PNG mask URL. Transparent pixels mark the edit region.',
        },
      }),
      required: ['prompt', 'input_images'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Replace the sky with a dramatic thunderstorm',
      input_images: ['https://example.com/landscape.png'],
      resolution: '1024x1024',
      mode: 'medium',
    },
  },
];

// --------------------------------------------------------------------------
// OpenRouter video methods (Seedance 2.0 / 2.0-fast / 1.5-pro)
// --------------------------------------------------------------------------

const openrouterVideoBaseProps = (extra: Record<string, unknown> = {}) => ({
  prompt: promptProp,
  // Bundle-dim marker mirroring the Seedance pattern — both video methods
  // map onto the same BundleMethod (VIDEO_GENERATION) so the mode keeps
  // text-to-video and image-to-video bundle keys distinct.
  mode: {
    type: 'string',
    enum: ['text_to_video', 'image_to_video'],
    'x-bundle-dim': true,
    description: 'Internal task-type marker (matches the method code).',
  },
  resolution: {
    type: 'string',
    enum: ['480p', '720p', '1080p'],
    'x-bundle-dim': true,
    description:
      'Output resolution. Seedance 2.0 Fast caps at 720p; 2.0 and 1.5 Pro support 1080p.',
  },
  duration_seconds: {
    type: 'integer',
    minimum: 4,
    maximum: 15,
    description:
      'Video duration in seconds. PER_SECOND pricing — duration is not part of the bundle key. Seedance 1.5 Pro accepts 4–12; 2.0 family accepts 4–15.',
  },
  aspect_ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    description: 'Output aspect ratio.',
  },
  callback_url: callbackUrlProp,
  ...extra,
});

const openrouterVideoMethods: MethodSeed[] = [
  {
    code: 'text_to_video',
    publicName: 'Text to video',
    description: 'Generate a short video from a text prompt (OpenRouter-routed Seedance).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: openrouterVideoBaseProps(),
      required: ['prompt'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Cinematic shot of a falcon diving through neon clouds at sunset',
      resolution: '1080p',
      duration_seconds: 5,
      aspect_ratio: '16:9',
    },
  },
  {
    code: 'image_to_video',
    publicName: 'Image to video',
    description: 'Animate a static image into a short video (OpenRouter-routed Seedance).',
    supportsAsync: true,
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      'x-bundle-unit': 'PER_SECOND',
      properties: openrouterVideoBaseProps({
        image: {
          type: 'string',
          description: 'Source image URL (https://) or data: URI — used as the first frame.',
        },
      }),
      required: ['image'],
      additionalProperties: false,
    },
    exampleRequest: {
      prompt: 'Subtle parallax and atmospheric haze, cinematic lighting',
      image: 'https://example.com/first-frame.jpg',
      resolution: '1080p',
      duration_seconds: 5,
      aspect_ratio: '16:9',
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
        code: 'gemini-2.5-flash-image',
        publicName: 'Nano Banana Standard',
        description: 'Original Nano Banana (V1) — budget tier, text-to-image only.',
        sortOrder: 5,
        methods: [
          {
            ...bananaMethods[0]!, // text_to_image
            sortOrder: 10,
          },
        ],
      },
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
      {
        // Imagen 4 — Vertex-native text-to-image. Different model family
        // from Gemini (Nano Banana), exposed separately so callers can
        // pick deterministically. text_to_image only; Imagen edit lives
        // on a different endpoint we don't wire up yet.
        code: 'imagen-4.0-generate-001',
        publicName: 'Imagen 4',
        description: 'Vertex-native text-to-image (standard tier).',
        sortOrder: 30,
        methods: [
          {
            ...bananaMethods[0]!, // text_to_image
            sortOrder: 10,
          },
        ],
      },
      {
        code: 'imagen-4.0-ultra-generate-001',
        publicName: 'Imagen 4 Ultra',
        description: 'Vertex-native text-to-image (ultra tier — higher fidelity).',
        sortOrder: 40,
        methods: [
          {
            ...bananaMethods[0]!, // text_to_image
            sortOrder: 10,
          },
        ],
      },
      // ---------- Gemini text + embedding models -----------------------
      {
        code: 'gemini-2.5-pro',
        publicName: 'Gemini 2.5 Pro',
        description:
          'Top-tier reasoning model — best for complex multi-step tasks, code, structured extraction. 1M token context, JSON & function-calling support.',
        sortOrder: 100,
        methods: [{ ...geminiTextMethods[0]!, sortOrder: 10 }], // text_generation
      },
      {
        code: 'gemini-2.5-flash',
        publicName: 'Gemini 2.5 Flash',
        description:
          'Fast, capable workhorse model. 1M token context. Best price/performance for chat completion, summarisation, JSON extraction at scale.',
        sortOrder: 110,
        methods: [{ ...geminiTextMethods[0]!, sortOrder: 10 }],
      },
      {
        code: 'gemini-2.5-flash-lite',
        publicName: 'Gemini 2.5 Flash Lite',
        description:
          'Cheapest Gemini 2.5 tier — high throughput, latency-sensitive workloads. 1M token context.',
        sortOrder: 120,
        methods: [{ ...geminiTextMethods[0]!, sortOrder: 10 }],
      },
      {
        code: 'text-embedding-004',
        publicName: 'Text Embedding 004',
        description:
          'Google text-embedding-004 — 768-dim multilingual embeddings (truncatable). Use for semantic search, RAG, classification, clustering. Inputs up to 2048 tokens each, up to 100 inputs per call.',
        sortOrder: 130,
        methods: [{ ...geminiTextMethods[1]!, sortOrder: 10 }], // embedding
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
      // kling-o1 used to be listed here, but the worker adapter doesn't
      // include it in SUPPORTED_MODELS — leaving it in the catalog only
      // misleads clients. Restore when the adapter learns it.
    ],
  },
  {
    code: 'seedance',
    publicName: 'Bytedance Seedance',
    description:
      'Bytedance Seedance (Doubao) video generation — Pro for top quality up to 1080p, Lite for budget t2v/i2v at 720p.',
    sortOrder: 40,
    models: [
      {
        code: 'doubao-seedance-1-0-pro-250528',
        publicName: 'Seedance 1.0 Pro',
        description: 'Top Seedance tier — supports both text-to-video and image-to-video up to 1080p.',
        sortOrder: 10,
        methods: seedanceMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'doubao-seedance-1-0-lite-t2v-250428',
        publicName: 'Seedance 1.0 Lite (T2V)',
        description: 'Budget text-to-video, 720p cap.',
        sortOrder: 20,
        methods: [{ ...seedanceMethods[0]!, sortOrder: 10 }],
      },
      {
        code: 'doubao-seedance-1-0-lite-i2v-250428',
        publicName: 'Seedance 1.0 Lite (I2V)',
        description: 'Budget image-to-video, 720p cap.',
        sortOrder: 30,
        methods: [{ ...seedanceMethods[1]!, sortOrder: 10 }],
      },
      // Seedance 2.0 family + 1.5 Pro — routed under the hood through
      // OpenRouter's unified /api/v1/videos endpoint (token-priced async LRO).
      // Catalog-wise they're regular Seedance models; the worker registry
      // resolves to OpenRouterVideoAdapter via the model-code allow-list.
      {
        code: 'openrouter-seedance-2-0',
        publicName: 'Seedance 2.0',
        description:
          'ByteDance Seedance 2.0 — text-to-video and image-to-video up to 1080p with native audio.',
        sortOrder: 40,
        methods: openrouterVideoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'openrouter-seedance-2-0-fast',
        publicName: 'Seedance 2.0 Fast',
        description:
          'Faster, cheaper Seedance 2.0 tier — 720p cap, otherwise identical t2v/i2v capabilities.',
        sortOrder: 50,
        methods: openrouterVideoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'openrouter-seedance-1-5-pro',
        publicName: 'Seedance 1.5 Pro',
        description:
          'Seedance 1.5 Pro — 4.5B-param Dual-Branch DiT generating synced video+audio in a single pass, up to 1080p.',
        sortOrder: 60,
        methods: openrouterVideoMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
    ],
  },
  {
    code: 'openai_image',
    publicName: 'OpenAI Images',
    description:
      'OpenAI image generation — gpt-image-2 (flagship, reasoning-based), gpt-image-1 (native multimodal), dall-e-3 (legacy), dall-e-2 (legacy).',
    sortOrder: 50,
    models: [
      {
        code: 'gpt-image-2',
        publicName: 'GPT Image 2',
        description:
          'Flagship OpenAI image model (Apr 2026) — reasoning-based composition, near-perfect multilingual text rendering (CJK, Arabic, Devanagari), supports up to 3840px on the long edge, accepts up to 16 input images for composite edits.',
        sortOrder: 5,
        methods: openaiImageMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'gpt-image-1',
        publicName: 'GPT Image 1',
        description: 'Native GPT-4o image model — t2i + image edit, low/medium/high quality.',
        sortOrder: 10,
        methods: openaiImageMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
      {
        code: 'dall-e-3',
        publicName: 'DALL·E 3',
        description: 'Legacy DALL·E 3 — text-to-image only, standard or HD.',
        sortOrder: 20,
        methods: [{ ...openaiImageMethods[0]!, sortOrder: 10 }],
      },
      {
        code: 'dall-e-2',
        publicName: 'DALL·E 2',
        description: 'Legacy DALL·E 2 — t2i + edit at 256/512/1024 squares.',
        sortOrder: 30,
        methods: openaiImageMethods.map((m, i) => ({ ...m, sortOrder: (i + 1) * 10 })),
      },
    ],
  },
];
