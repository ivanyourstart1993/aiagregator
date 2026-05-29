#!/usr/bin/env node
// Catalog ↔ playground-preset consistency check.
//
// Every preset surfaced in the Generate UI (apps/web .../playground-presets.ts)
// targets a (provider, model, method) tuple whose request shape is governed by
// a JSON Schema in the catalog seed (packages/db/prisma/seed/initial-catalog.ts)
// with `additionalProperties: false`. When a preset and that schema drift apart
// — a renamed method, a field the UI sends that the schema rejects, or an image
// count the schema caps below what the UI allows — the generation fails at
// admit time with the opaque "Request parameters failed validation".
//
// This guard mirrors what PlaygroundClient.handleSubmit actually sends and
// fails the push if any preset can't pass its method's schema. Scope is kept to
// high-confidence checks (existence, image-field name, image-count cap); it
// deliberately does not police resolution/size, where provider-specific
// param mapping makes false positives likely.
//
// Run: node scripts/check-catalog-presets.mjs   (exit 0 = ok, 1 = drift)

import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const catalogUrl = pathToFileURL(
  resolve(ROOT, 'packages/db/prisma/seed/initial-catalog.ts'),
).href;
const presetsUrl = pathToFileURL(
  resolve(ROOT, 'apps/web/src/components/dashboard/playground/playground-presets.ts'),
).href;

const { initialCatalog } = await import(catalogUrl);
const { PRESETS } = await import(presetsUrl);

// Index catalog methods by "provider/model/method" → parametersSchema.
const schemaByKey = new Map();
for (const provider of initialCatalog) {
  for (const model of provider.models) {
    for (const method of model.methods) {
      schemaByKey.set(
        `${provider.code}/${model.code}/${method.code}`,
        method.parametersSchema,
      );
    }
  }
}

// MAX_INPUT_IMAGES default in PlaygroundClient.tsx. Kept in sync manually; the
// "cap exceeds schema maxItems" check below is what catches the dangerous case.
const DEFAULT_MAX_INPUT_IMAGES = 6;

const errors = [];

for (const [id, p] of Object.entries(PRESETS)) {
  const baseKey = `${p.provider}/${p.model}/${p.method}`;
  const baseSchema = schemaByKey.get(baseKey);
  if (!baseSchema) {
    errors.push(`${id}: method not in catalog — ${baseKey}`);
    continue;
  }

  // Video presets switch to imageMethod once an image is attached; that target
  // must also exist and declare the field the UI sends for it.
  if (p.needsVideo && p.imageMethod) {
    const imgKey = `${p.provider}/${p.model}/${p.imageMethod}`;
    const imgSchema = schemaByKey.get(imgKey);
    if (!imgSchema) {
      errors.push(`${id}: imageMethod not in catalog — ${imgKey}`);
    } else {
      // Mirror handleSubmit: kling → input_images, seedance → image, else → input_image_url
      const field =
        p.provider === 'kling_ai'
          ? 'input_images'
          : p.provider === 'seedance'
            ? 'image'
            : 'input_image_url';
      const props = imgSchema.properties ?? {};
      if (!props[field]) {
        errors.push(
          `${id}: ${p.imageMethod} schema has no '${field}' (UI sends it for ${p.provider}); ` +
            `schema props: ${Object.keys(props).join(', ')}`,
        );
      }
    }
  }

  // Motion Control is a special case: the preset is needsImage (to show the
  // character-image uploader) but handleSubmit sends `input_image` (singular)
  // + `reference_video`, NOT `input_images`. Validate against that shape and
  // skip the input_images check below.
  if (p.method === 'motion_control') {
    const props = baseSchema.properties ?? {};
    for (const field of ['input_image', 'reference_video']) {
      if (!props[field]) {
        errors.push(
          `${id}: motion_control schema has no '${field}' (UI sends it); ` +
            `schema props: ${Object.keys(props).join(', ')}`,
        );
      }
    }
    continue;
  }

  // image_edit / multi_reference presets send input_images, capped in the UI at
  // (maxInputImages ?? 6). The schema's input_images bounds must accommodate it.
  if (p.needsImage) {
    const props = baseSchema.properties ?? {};
    const ii = props.input_images;
    if (!ii) {
      errors.push(
        `${id}: ${p.method} schema has no 'input_images' (UI sends it); ` +
          `schema props: ${Object.keys(props).join(', ')}`,
      );
    } else {
      const cap = p.maxInputImages ?? DEFAULT_MAX_INPUT_IMAGES;
      if (typeof ii.maxItems === 'number' && cap > ii.maxItems) {
        errors.push(
          `${id}: UI allows up to ${cap} source images but ${p.method} schema caps ` +
            `input_images at maxItems=${ii.maxItems}. Set maxInputImages:${ii.maxItems} ` +
            `on the preset, or use a method whose schema allows more.`,
        );
      }
      if (typeof ii.minItems === 'number' && ii.minItems > 1) {
        // The preset is fine, but flag if its cap can't even reach the minimum.
        const cap2 = p.maxInputImages ?? DEFAULT_MAX_INPUT_IMAGES;
        if (cap2 < ii.minItems) {
          errors.push(
            `${id}: ${p.method} schema requires at least ${ii.minItems} input_images ` +
              `but the preset cap is ${cap2}.`,
          );
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`\n✗ catalog ↔ preset check failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ catalog ↔ preset check passed (${Object.keys(PRESETS).length} presets)`);
