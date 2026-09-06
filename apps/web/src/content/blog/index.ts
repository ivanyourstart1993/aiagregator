// Static registry of blog posts. Each `.mdx` file is imported as a raw string
// (asset/source loader) so the content is bundled into the build output — no
// runtime filesystem access, which keeps it working under `output: standalone`.
//
// To publish a new post: add `<slug>.mdx` next to this file, import it here,
// and append an entry below. The filename stem is the URL slug.
import imagen4Api from './imagen-4-api.mdx?raw';
import nanoBananaApi from './nano-banana-api.mdx?raw';
import klingApi from './kling-api.mdx?raw';
import seedanceApi from './seedance-api.mdx?raw';
import veo3Api from './veo-3-api.mdx?raw';
import midjourneyApiAlternative from './midjourney-api-alternative.mdx?raw';
import fluxApiAlternative from './flux-api-alternative.mdx?raw';
import ideogramApiAlternative from './ideogram-api-alternative.mdx?raw';
import recraftApiAlternative from './recraft-api-alternative.mdx?raw';
import stableDiffusionApiAlternative from './stable-diffusion-api-alternative.mdx?raw';
import leonardoAiApiAlternative from './leonardo-ai-api-alternative.mdx?raw';
import runwayApiAlternative from './runway-api-alternative.mdx?raw';
import gptImage1Api from './gpt-image-1-api.mdx?raw';
import dalle3Api from './dalle-3-api.mdx?raw';
import falAiAlternative from './fal-ai-alternative.mdx?raw';
import replicateApiAlternative from './replicate-api-alternative.mdx?raw';
import aimlapiAlternative from './aimlapi-alternative.mdx?raw';
import togetherAiImagesAlternative from './together-ai-images-alternative.mdx?raw';
import pikaApiAlternative from './pika-api-alternative.mdx?raw';
import lumaDreamMachineApiAlternative from './luma-dream-machine-api-alternative.mdx?raw';
import wanVideoApiAlternative from './wan-video-api-alternative.mdx?raw';

export interface RawPost {
  slug: string;
  raw: string;
}

export const rawPosts: RawPost[] = [
  { slug: 'imagen-4-api', raw: imagen4Api },
  { slug: 'nano-banana-api', raw: nanoBananaApi },
  { slug: 'kling-api', raw: klingApi },
  { slug: 'seedance-api', raw: seedanceApi },
  { slug: 'veo-3-api', raw: veo3Api },
  { slug: 'midjourney-api-alternative', raw: midjourneyApiAlternative },
  { slug: 'flux-api-alternative', raw: fluxApiAlternative },
  { slug: 'ideogram-api-alternative', raw: ideogramApiAlternative },
  { slug: 'recraft-api-alternative', raw: recraftApiAlternative },
  { slug: 'stable-diffusion-api-alternative', raw: stableDiffusionApiAlternative },
  { slug: 'leonardo-ai-api-alternative', raw: leonardoAiApiAlternative },
  { slug: 'runway-api-alternative', raw: runwayApiAlternative },
  { slug: 'gpt-image-1-api', raw: gptImage1Api },
  { slug: 'dalle-3-api', raw: dalle3Api },
  { slug: 'fal-ai-alternative', raw: falAiAlternative },
  { slug: 'replicate-api-alternative', raw: replicateApiAlternative },
  { slug: 'aimlapi-alternative', raw: aimlapiAlternative },
  { slug: 'together-ai-images-alternative', raw: togetherAiImagesAlternative },
  { slug: 'pika-api-alternative', raw: pikaApiAlternative },
  { slug: 'luma-dream-machine-api-alternative', raw: lumaDreamMachineApiAlternative },
  { slug: 'wan-video-api-alternative', raw: wanVideoApiAlternative },
];
