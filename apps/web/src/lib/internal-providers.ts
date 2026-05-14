/**
 * Provider codes that are infrastructure-internal — they exist in the catalog
 * because they back real models in the playground / billing, but they should
 * NOT appear in public-facing surfaces (docs sidebar, /docs/methods listings,
 * API explorer, etc.) where end users would otherwise see them as a separate
 * brand to integrate against.
 *
 * Right now this covers `openrouter`, which we use as a transparent routing
 * layer for the Seedance 2.0 family. The end user thinks they're calling
 * "Seedance"; we route through OpenRouter under the hood.
 *
 * To opt a provider in/out of the public docs without code changes you'd
 * normally toggle a `Provider.status` enum (e.g. INTERNAL); this constant is
 * the lighter-weight cousin for the same idea while no schema column exists.
 */
export const INTERNAL_PROVIDER_CODES: ReadonlySet<string> = new Set([
  'openrouter',
]);

export function isPublicProvider(code: string): boolean {
  return !INTERNAL_PROVIDER_CODES.has(code);
}
