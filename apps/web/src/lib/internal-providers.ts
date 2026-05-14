/**
 * Provider codes that are infrastructure-internal — they exist in the catalog
 * because they back real models in the playground / billing, but they should
 * NOT appear in public-facing surfaces (docs sidebar, /docs/methods listings,
 * API explorer, etc.) where end users would otherwise see them as a separate
 * brand to integrate against.
 *
 * Currently empty. `openrouter` used to live here when it was its own catalog
 * provider; the Seedance 2.0 family it back-routed has since been merged
 * under `provider=seedance` so there's no longer a separate openrouter row
 * to hide. The helper stays in place for the next time we need to back a
 * model family with an internal-only routing brand.
 *
 * To opt a provider in/out of the public docs without code changes you'd
 * normally toggle a `Provider.status` enum (e.g. INTERNAL); this constant is
 * the lighter-weight cousin for the same idea while no schema column exists.
 */
export const INTERNAL_PROVIDER_CODES: ReadonlySet<string> = new Set([]);

export function isPublicProvider(code: string): boolean {
  return !INTERNAL_PROVIDER_CODES.has(code);
}
