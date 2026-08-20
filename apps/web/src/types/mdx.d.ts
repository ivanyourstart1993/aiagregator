// Blog posts are authored as `.mdx` files and imported as raw source strings
// (the `asset/source` webpack rule in next.config.mjs), then compiled at request
// time with next-mdx-remote. This keeps content bundled into the standalone
// output instead of relying on runtime `fs` reads, which the tracer would miss.
//
// We import with the `?raw` suffix so this declaration wins over the `*.mdx`
// wildcard from `@types/mdx` (which types the default export as an MDX
// component). The `?raw` query never matches that wildcard, so the import is
// unambiguously a string.
declare module '*.mdx?raw' {
  const source: string;
  export default source;
}
