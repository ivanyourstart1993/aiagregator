import type { BundleMethod, BundleUnit, Currency, PriceSource } from '@aiagg/db';

export interface PriceComponentsView {
  basePriceUnits: bigint | null;
  inputPerTokenUnits: bigint | null;
  outputPerTokenUnits: bigint | null;
  perSecondUnits: bigint | null;
  perImageUnits: bigint | null;
}

export interface BundleView {
  id: string;
  providerSlug: string;
  modelSlug: string;
  method: BundleMethod;
  mode: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  bundleKey: string;
  unit: BundleUnit;
  isActive: boolean;
}

export interface ResolvedPriceView {
  source: PriceSource;
  sourceRefId: string;
  currency: Currency;
  components: PriceComponentsView;
  bundle: BundleView;
  pricingSnapshotId?: string;
}

export interface EffectivePriceView {
  bundle: BundleView;
  source: PriceSource;
  sourceRefId: string;
  currency: Currency;
  components: PriceComponentsView;
  marginBps?: number | null;
  providerCostUnits?: bigint | null;
}

export interface TariffView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  currency: Currency;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserTariffView {
  id: string;
  userId: string;
  tariffId: string;
  tariff: TariffView;
  reason: string | null;
  assignedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TariffBundlePriceView {
  id: string;
  tariffId: string;
  bundleId: string;
  components: PriceComponentsView;
  providerCostUnits: bigint | null;
  marginBps: number | null;
  currency: Currency;
  effectiveFrom: Date;
}

export interface UserBundlePriceView {
  id: string;
  userId: string;
  bundleId: string;
  components: PriceComponentsView;
  reason: string | null;
  setById: string | null;
  currency: Currency;
  effectiveFrom: Date;
}
