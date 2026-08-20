// Static registry of blog posts. Each `.mdx` file is imported as a raw string
// (asset/source loader) so the content is bundled into the build output — no
// runtime filesystem access, which keeps it working under `output: standalone`.
//
// To publish a new post: add `<slug>.mdx` next to this file, import it here,
// and append an entry below. The filename stem is the URL slug.
import nanoBananaApi from './nano-banana-api.mdx?raw';
import klingApi from './kling-api.mdx?raw';

export interface RawPost {
  slug: string;
  raw: string;
}

export const rawPosts: RawPost[] = [
  { slug: 'nano-banana-api', raw: nanoBananaApi },
  { slug: 'kling-api', raw: klingApi },
];
