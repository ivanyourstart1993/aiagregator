// Static registry of blog posts. Each `.mdx` file is imported as a raw string
// (asset/source loader) so the content is bundled into the build output — no
// runtime filesystem access, which keeps it working under `output: standalone`.
//
// To publish a new post: add `<slug>.mdx` next to this file, import it here,
// and append an entry below. The filename stem is the URL slug.
import nanoBananaApi from './nano-banana-api.mdx?raw';
import klingApi from './kling-api.mdx?raw';
import seedanceApi from './seedance-api.mdx?raw';
import veo3Api from './veo-3-api.mdx?raw';
import midjourneyApiAlternative from './midjourney-api-alternative.mdx?raw';

export interface RawPost {
  slug: string;
  raw: string;
}

export const rawPosts: RawPost[] = [
  { slug: 'nano-banana-api', raw: nanoBananaApi },
  { slug: 'kling-api', raw: klingApi },
  { slug: 'seedance-api', raw: seedanceApi },
  { slug: 'veo-3-api', raw: veo3Api },
  { slug: 'midjourney-api-alternative', raw: midjourneyApiAlternative },
];
