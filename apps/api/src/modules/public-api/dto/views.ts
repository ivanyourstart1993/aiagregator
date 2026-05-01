import type { ApiRequestStatus, Currency, TaskMode, TaskStatus } from '@aiagg/db';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    emailVerified: Date | null;
    // Per-user rate-limit overrides. NULL → guards fall back to env
    // defaults. Loaded by PublicApiKeyGuard so guards downstream can
    // read them without an extra DB hit per request.
    rateLimitPerMin: number | null;
    rateLimitPerDay: number | null;
    maxConcurrentTasks: number | null;
    maxRequestsPerDayPerUser: number | null;
  };
  apiKey: {
    id: string;
    userId: string;
    prefix: string;
  };
}

export interface PricingComponentsView {
  basePriceUnits: bigint | null;
  inputPerTokenUnits: bigint | null;
  outputPerTokenUnits: bigint | null;
  perSecondUnits: bigint | null;
  perImageUnits: bigint | null;
}

export interface EstimateResultView {
  success: true;
  provider: string;
  model: string;
  method: string;
  pricing: {
    price_type: string;
    final_price: bigint;
    discount: bigint;
    reserved_amount: bigint;
    currency: Currency;
    pricing_rule_id: string;
    bundle_key: string;
    components: PricingComponentsView;
  };
  balance: {
    available: bigint;
    reserved: bigint;
    enough_balance: boolean;
    currency: Currency;
  };
}

export interface AdmitResultView {
  success: true;
  mode: 'sync' | 'async';
  status: TaskStatus;
  task_id: string;
  reserved_amount: bigint;
  currency: Currency;
  message: string;
}

export interface TaskView {
  id: string;
  status: TaskStatus;
  mode: TaskMode;
  provider?: string;
  model?: string;
  method?: string;
  bundle_key?: string;
  reserved_amount: bigint | null;
  result?: unknown;
  result_files?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  created_at: Date;
  started_at?: Date | null;
  finished_at?: Date | null;
}

export interface ApiRequestView {
  id: string;
  status: ApiRequestStatus;
  method_id: string;
  bundle_key: string;
  base_price_units: bigint;
  discount_units: bigint;
  client_price_units: bigint;
  pricing_snapshot_id: string | null;
  reservation_id: string | null;
  coupon_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  finalized_at: Date | null;
}
