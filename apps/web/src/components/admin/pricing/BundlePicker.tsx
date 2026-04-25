'use client';

import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import type { BundleView } from '@/lib/server-api';

interface Props {
  bundles: BundleView[];
  excludeIds?: string[];
  value?: string;
  onChange: (bundleId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

function describeBundle(b: BundleView): string {
  const parts = [b.providerSlug, b.modelSlug, b.method].filter(Boolean);
  const quals = [b.mode, b.resolution, b.durationSeconds ? `${b.durationSeconds}s` : null, b.aspectRatio]
    .filter(Boolean)
    .join('/');
  return quals ? `${parts.join(' / ')} (${quals})` : parts.join(' / ');
}

export function BundlePicker({
  bundles,
  excludeIds = [],
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: Props) {
  const options: ComboboxOption[] = useMemo(() => {
    const set = new Set(excludeIds);
    return bundles
      .filter((b) => !set.has(b.id))
      .map((b) => ({
        value: b.id,
        label: describeBundle(b),
        hint: b.bundleKey.slice(0, 16),
      }));
  }, [bundles, excludeIds]);

  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
    />
  );
}
