/**
 * Server-only thin wrappers around the typed API client. Keep this surface
 * intentionally narrow: server actions and RSC data fetches go through here.
 */
import 'server-only';
import { apiGet, apiPost, apiDelete, apiPatch, apiFetch, ApiError } from './api-client';

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: 'ACTIVE' | 'DISABLED' | 'REVOKED';
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  emailVerified: string | null;
  locale: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

// ---- Stage 2: Billing & Payments ----

export type TransactionType =
  | 'DEPOSIT'
  | 'DEBIT'
  | 'REFUND'
  | 'CORRECTION'
  | 'BONUS_GRANT'
  | 'BONUS_CORRECTION'
  | 'COUPON_DISCOUNT'
  | 'RESERVATION_HOLD'
  | 'RESERVATION_RELEASE'
  | 'RESERVATION_CAPTURE';

export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FAILED';

export interface BalanceView {
  available: string;
  reserved: string;
  total: string;
  bonusAvailable: string;
  currency: 'USD';
}

export interface TransactionView {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amountUnits: string;
  balanceAfterUnits: string;
  reservedAfterUnits?: string;
  currency: 'USD';
  description: string | null;
  createdAt: string;
  depositId?: string | null;
  reservationId?: string | null;
  taskId?: string | null;
  bundleKey?: string | null;
  parentTransactionId?: string | null;
  pricingSnapshotId?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TransactionsPage {
  items: TransactionView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TransactionFiltersInput {
  type?: TransactionType[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  userId?: string;
}

export type DepositStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUNDED';

export interface DepositView {
  id: string;
  userId?: string;
  userEmail?: string;
  provider: string;
  status: DepositStatus;
  amountUnits: string;
  currency: 'USD';
  payUrl?: string | null;
  paidAmount?: string | null;
  paidCurrency?: string | null;
  txid?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  couponCode?: string | null;
  externalInvoiceId?: string | null;
  externalOrderId?: string | null;
}

export interface DepositDetail extends DepositView {
  rawCreatePayload?: unknown;
  rawWebhookPayloads?: unknown[];
}

export interface DepositsPage {
  items: DepositView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReservationView {
  id: string;
  userId: string;
  amountUnits: string;
  capturedUnits?: string | null;
  status: 'PENDING' | 'CAPTURED' | 'RELEASED' | 'EXPIRED';
  taskId?: string | null;
  bundleKey?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface WalletDetail {
  userId: string;
  email?: string;
  name?: string | null;
  available: string;
  reserved: string;
  total: string;
  bonusAvailable: string;
  currency: 'USD';
  reservations?: ReservationView[];
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerified: string | null;
  createdAt: string;
}

function buildQuery(filters: TransactionFiltersInput | undefined): string {
  if (!filters) return '';
  const usp = new URLSearchParams();
  if (filters.userId) usp.set('userId', filters.userId);
  if (filters.from) usp.set('from', filters.from);
  if (filters.to) usp.set('to', filters.to);
  if (filters.page != null) usp.set('page', String(filters.page));
  if (filters.pageSize != null) usp.set('pageSize', String(filters.pageSize));
  if (filters.type && filters.type.length > 0) {
    for (const t of filters.type) usp.append('type', t);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// ---- Stage 3: Pricing ----

export type BundleMethod =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'EMBEDDING'
  | 'OTHER';

export type PricingUnit =
  | 'PER_REQUEST'
  | 'PER_TOKEN_INPUT'
  | 'PER_TOKEN_OUTPUT'
  | 'PER_SECOND'
  | 'PER_IMAGE';

export type PriceSource = 'USER_BUNDLE_OVERRIDE' | 'USER_TARIFF' | 'DEFAULT_TARIFF';

export interface PriceComponents {
  basePriceUnits?: string | null;
  inputPerTokenUnits?: string | null;
  outputPerTokenUnits?: string | null;
  perSecondUnits?: string | null;
  perImageUnits?: string | null;
  providerCostUnits?: string | null;
  marginBps?: number | null;
}

export interface EffectivePriceView {
  bundleKey: string;
  bundleId: string;
  provider: string;
  model: string;
  method: BundleMethod | string;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  unit: PricingUnit;
  currency: 'USD';
  source: PriceSource;
  sourceRefId: string;
  components: PriceComponents;
  computedAt: string;
}

export interface TariffSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  currency: 'USD';
  createdAt?: string;
  updatedAt?: string;
}

export interface TariffsPage {
  items: TariffSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BundleView {
  id: string;
  bundleKey: string;
  providerSlug: string;
  modelSlug: string;
  method: BundleMethod | string;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  unit: PricingUnit;
  isActive: boolean;
  createdAt?: string;
}

export interface BundlesPage {
  items: BundleView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TariffBundlePriceView {
  id?: string;
  tariffId: string;
  bundleId: string;
  bundle?: BundleView;
  basePriceUnits?: string | null;
  inputPerTokenUnits?: string | null;
  outputPerTokenUnits?: string | null;
  perSecondUnits?: string | null;
  perImageUnits?: string | null;
  providerCostUnits?: string | null;
  marginBps?: number | null;
  currency: 'USD';
  effectiveFrom?: string;
}

export interface UserBundlePriceView {
  id?: string;
  userId: string;
  bundleId: string;
  bundle?: BundleView;
  basePriceUnits?: string | null;
  inputPerTokenUnits?: string | null;
  outputPerTokenUnits?: string | null;
  perSecondUnits?: string | null;
  perImageUnits?: string | null;
  providerCostUnits?: string | null;
  marginBps?: number | null;
  reason?: string | null;
  currency: 'USD';
}

export interface BundlePriceInput {
  basePriceUnits?: string | null;
  inputPerTokenUnits?: string | null;
  outputPerTokenUnits?: string | null;
  perSecondUnits?: string | null;
  perImageUnits?: string | null;
  providerCostUnits?: string | null;
  marginBps?: number | null;
}

export interface TariffChangeLogEntry {
  id: string;
  tariffId?: string | null;
  userId?: string | null;
  bundleId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  changedById?: string | null;
  createdAt: string;
}

export interface TariffChangeLogPage {
  items: TariffChangeLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

interface TariffsListFilters {
  active?: boolean;
  page?: number;
  pageSize?: number;
}

interface BundlesListFilters {
  provider?: string;
  model?: string;
  method?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

interface ChangesListFilters {
  tariffId?: string;
  userId?: string;
  bundleId?: string;
  page?: number;
  pageSize?: number;
}

function qs(filters: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const serverApi = {
  // Stage 1
  listApiKeys: () => apiGet<ApiKeyView[]>('/internal/api-keys'),
  createApiKey: (name: string) =>
    apiPost<{ id: string; plaintext: string; key: ApiKeyView }>('/internal/api-keys', { name }),
  revokeApiKey: (id: string) => apiDelete<void>(`/internal/api-keys/${id}`),
  me: () => apiGet<CurrentUser>('/internal/users/me'),
  updateMe: (data: Partial<{ name: string; locale: string }>) =>
    apiPatch<CurrentUser>('/internal/users/me', data),
  register: (body: { email: string; password: string; name: string; locale: string }) =>
    apiPost<{ ok: true }>('/internal/auth/register', body, { anonymous: true }),
  verifyEmail: (token: string) =>
    apiPost<{ ok: true }>('/internal/auth/verify-email', { token }, { anonymous: true }),
  resendVerification: (email: string) =>
    apiPost<{ ok: true }>('/internal/auth/resend-verification', { email }, { anonymous: true }),

  // Stage 2 — User billing
  getBalance: () => apiGet<BalanceView>('/internal/billing/balance'),
  listTransactions: (filters?: TransactionFiltersInput) =>
    apiGet<TransactionsPage>(`/internal/billing/transactions${buildQuery(filters)}`),
  getTransaction: (id: string) => apiGet<TransactionView>(`/internal/billing/transactions/${id}`),

  // Stage 2 — Payments / top-up
  createTopUpInvoice: (amountCents: number, couponCode?: string) =>
    apiPost<{ depositId: string; payUrl: string; expiresAt: string }>(
      '/internal/payments/top-up/invoice',
      couponCode ? { amountCents, couponCode } : { amountCents },
    ),
  getDeposit: (id: string) => apiGet<DepositView>(`/internal/payments/top-up/${id}`),
  listDeposits: () => apiGet<{ items: DepositView[] } | DepositView[]>(`/internal/payments/top-up`),

  // Stage 2 — Admin billing
  adminGetWallet: (userId: string) =>
    apiGet<WalletDetail>(`/internal/admin/billing/users/${userId}/wallet`),
  adminListTransactions: (filters?: TransactionFiltersInput) =>
    apiGet<TransactionsPage>(`/internal/admin/billing/transactions${buildQuery(filters)}`),
  adminCredit: (userId: string, body: { amountUnits: string; reason: string; idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/users/${userId}/credit`, body),
  adminDebit: (userId: string, body: { amountUnits: string; reason: string; idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/users/${userId}/debit`, body),
  adminCorrect: (userId: string, body: { amountUnits: string; reason: string; idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/users/${userId}/correct`, body),
  adminBonus: (userId: string, body: { amountUnits: string; reason: string; idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/users/${userId}/bonus`, body),
  adminReserve: (userId: string, body: { amountUnits: string; reason: string; idempotencyKey?: string }) =>
    apiPost<ReservationView>(`/internal/admin/billing/users/${userId}/reserve`, body),
  adminCapture: (rid: string, body: { captureUnits?: string; idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/reservations/${rid}/capture`, body),
  adminRelease: (rid: string, body: { idempotencyKey?: string }) =>
    apiPost<TransactionView>(`/internal/admin/billing/reservations/${rid}/release`, body),

  // Stage 2 — Admin deposits
  adminListDeposits: (filters?: { userId?: string; status?: DepositStatus; page?: number; pageSize?: number }) => {
    const usp = new URLSearchParams();
    if (filters?.userId) usp.set('userId', filters.userId);
    if (filters?.status) usp.set('status', filters.status);
    if (filters?.page != null) usp.set('page', String(filters.page));
    if (filters?.pageSize != null) usp.set('pageSize', String(filters.pageSize));
    const q = usp.toString();
    return apiGet<DepositsPage>(`/internal/admin/payments/deposits${q ? `?${q}` : ''}`);
  },
  adminGetDeposit: (id: string) =>
    apiGet<DepositDetail>(`/internal/admin/payments/deposits/${id}`),

  // Stage 2 — Admin users
  adminListUsers: (q?: string) => {
    const usp = new URLSearchParams();
    if (q) usp.set('q', q);
    const qs = usp.toString();
    return apiGet<{ items: AdminUserSummary[] } | AdminUserSummary[]>(
      `/internal/admin/users${qs ? `?${qs}` : ''}`,
    );
  },
  adminGetUser: (id: string) => apiGet<AdminUserSummary>(`/internal/admin/users/${id}`),

  // Stage 3 — Pricing (user)
  getPricing: () => apiGet<EffectivePriceView[]>('/internal/pricing'),
  getPricingForBundle: (bundleKey: string) =>
    apiGet<EffectivePriceView>(`/internal/pricing/bundle/${encodeURIComponent(bundleKey)}`),
  getMyTariff: () => apiGet<TariffSummary>('/internal/pricing/tariff'),

  // Stage 3 — Admin tariffs CRUD
  adminListTariffs: (filters?: TariffsListFilters) =>
    apiGet<TariffsPage>(`/internal/admin/pricing/tariffs${qs({ ...filters })}`),
  adminGetTariff: (id: string) => apiGet<TariffSummary>(`/internal/admin/pricing/tariffs/${id}`),
  adminCreateTariff: (body: { slug: string; name: string; description?: string; currency?: string }) =>
    apiPost<TariffSummary>('/internal/admin/pricing/tariffs', body),
  adminUpdateTariff: (
    id: string,
    body: { name?: string; description?: string; isActive?: boolean },
  ) => apiPatch<TariffSummary>(`/internal/admin/pricing/tariffs/${id}`, body),
  adminSetDefaultTariff: (id: string) =>
    apiPost<TariffSummary>(`/internal/admin/pricing/tariffs/${id}/set-default`, {}),
  adminDeleteTariff: (id: string) => apiDelete<void>(`/internal/admin/pricing/tariffs/${id}`),

  // Stage 3 — Admin tariff bundle prices
  adminListTariffPrices: (id: string) =>
    apiGet<TariffBundlePriceView[]>(`/internal/admin/pricing/tariffs/${id}/prices`),
  adminUpsertTariffPrice: (id: string, bundleId: string, body: BundlePriceInput) =>
    apiFetch<TariffBundlePriceView>(
      `/internal/admin/pricing/tariffs/${id}/prices/${bundleId}`,
      { method: 'PUT', body },
    ),
  adminBatchUpsertTariffPrices: (
    id: string,
    body: { items: Array<BundlePriceInput & { bundleId: string }> },
  ) =>
    apiFetch<{ items: TariffBundlePriceView[] }>(
      `/internal/admin/pricing/tariffs/${id}/prices/batch`,
      { method: 'PUT', body },
    ),
  adminDeleteTariffPrice: (id: string, bundleId: string) =>
    apiDelete<void>(`/internal/admin/pricing/tariffs/${id}/prices/${bundleId}`),

  // Stage 3 — Admin user pricing
  adminAssignTariff: (userId: string, body: { tariffId: string; reason?: string }) =>
    apiPost<{ ok: true }>(`/internal/admin/pricing/users/${userId}/assign-tariff`, body),
  adminUnassignTariff: (userId: string) =>
    apiDelete<void>(`/internal/admin/pricing/users/${userId}/assign-tariff`),
  adminListUserBundlePrices: (userId: string) =>
    apiGet<UserBundlePriceView[]>(`/internal/admin/pricing/users/${userId}/bundle-prices`),
  adminUpsertUserBundlePrice: (
    userId: string,
    bundleId: string,
    body: BundlePriceInput & { reason?: string },
  ) =>
    apiFetch<UserBundlePriceView>(
      `/internal/admin/pricing/users/${userId}/bundle-prices/${bundleId}`,
      { method: 'PUT', body },
    ),
  adminDeleteUserBundlePrice: (userId: string, bundleId: string) =>
    apiDelete<void>(`/internal/admin/pricing/users/${userId}/bundle-prices/${bundleId}`),

  // Stage 3 — Admin bundles
  adminListBundles: (filters?: BundlesListFilters) =>
    apiGet<BundlesPage>(`/internal/admin/pricing/bundles${qs({ ...filters })}`),

  // Stage 3 — Admin tariff changes log
  adminListTariffChanges: (filters?: ChangesListFilters) =>
    apiGet<TariffChangeLogPage>(`/internal/admin/pricing/changes${qs({ ...filters })}`),

  // ---- Stage 4: Coupons (user) ----
  validateCoupon: (code: string) =>
    apiPost<CouponValidationView>('/internal/coupons/validate', { code }),
  redeemCoupon: (code: string) =>
    apiPost<{ coupon: CouponView; balance: BalanceView }>('/internal/coupons/redeem', { code }),
  listCouponHistory: (filters?: { page?: number; pageSize?: number }) =>
    apiGet<CouponRedemptionsPage>(`/internal/coupons/history${qs({ ...filters })}`),

  // ---- Stage 4: Coupons (admin) ----
  adminListCoupons: (filters?: AdminCouponsFilters) =>
    apiGet<CouponsPage>(`/internal/admin/coupons${qs({ ...filters })}`),
  adminGetCoupon: (id: string) => apiGet<CouponView>(`/internal/admin/coupons/${id}`),
  adminCreateCoupon: (body: CreateCouponInput) =>
    apiPost<CouponView>('/internal/admin/coupons', body),
  adminUpdateCoupon: (id: string, body: UpdateCouponInput) =>
    apiPatch<CouponView>(`/internal/admin/coupons/${id}`, body),
  adminDeleteCoupon: (id: string) => apiDelete<void>(`/internal/admin/coupons/${id}`),
  adminListCouponRedemptions: (
    couponId: string,
    filters?: { page?: number; pageSize?: number },
  ) =>
    apiGet<CouponRedemptionsPage>(
      `/internal/admin/coupons/${couponId}/redemptions${qs({ ...filters })}`,
    ),
  adminListAllRedemptions: (filters?: AdminRedemptionsFilters) =>
    apiGet<CouponRedemptionsPage>(`/internal/admin/coupons/redemptions${qs({ ...filters })}`),

  // ---- Stage 5: Catalog (public) ----
  // API returns { items: [...] } envelope; unwrap on the client.
  catalogListProviders: async (): Promise<ProviderView[]> =>
    (await apiGet<{ items: ProviderView[] }>('/internal/catalog/providers')).items,
  catalogListMethods: async (filters?: { provider?: string; model?: string }): Promise<MethodView[]> =>
    (await apiGet<{ items: MethodView[] }>(`/internal/catalog/methods${qs({ ...filters })}`)).items,
  catalogGetMethod: (provider: string, model: string, method: string) =>
    apiGet<MethodView>(
      `/internal/catalog/methods/${encodeURIComponent(provider)}/${encodeURIComponent(model)}/${encodeURIComponent(method)}`,
    ),

  // ---- Stage 5: Catalog (admin) ----
  adminListProviders: () =>
    apiGet<ProviderAdminView[]>('/internal/admin/catalog/providers'),
  adminGetProvider: (id: string) =>
    apiGet<ProviderAdminView>(`/internal/admin/catalog/providers/${id}`),
  adminCreateProvider: (body: CreateProviderInput) =>
    apiPost<ProviderAdminView>('/internal/admin/catalog/providers', body),
  adminUpdateProvider: (id: string, body: UpdateProviderInput) =>
    apiPatch<ProviderAdminView>(`/internal/admin/catalog/providers/${id}`, body),
  adminDeleteProvider: (id: string) =>
    apiDelete<void>(`/internal/admin/catalog/providers/${id}`),

  adminListModels: (providerId: string) =>
    apiGet<ModelAdminView[]>(`/internal/admin/catalog/providers/${providerId}/models`),
  adminCreateModel: (providerId: string, body: CreateModelInput) =>
    apiPost<ModelAdminView>(
      `/internal/admin/catalog/providers/${providerId}/models`,
      body,
    ),
  adminGetModel: (modelId: string) =>
    apiGet<ModelAdminView>(`/internal/admin/catalog/models/${modelId}`),
  adminUpdateModel: (id: string, body: UpdateModelInput) =>
    apiPatch<ModelAdminView>(`/internal/admin/catalog/models/${id}`, body),
  adminDeleteModel: (id: string) =>
    apiDelete<void>(`/internal/admin/catalog/models/${id}`),

  adminListMethods: (modelId: string) =>
    apiGet<MethodAdminView[]>(`/internal/admin/catalog/models/${modelId}/methods`),
  adminCreateMethod: (modelId: string, body: CreateMethodInput) =>
    apiPost<MethodAdminView>(`/internal/admin/catalog/models/${modelId}/methods`, body),
  adminGetMethod: (id: string) =>
    apiGet<MethodAdminView>(`/internal/admin/catalog/methods/${id}`),
  adminUpdateMethod: (id: string, body: UpdateMethodInput) =>
    apiPatch<MethodAdminView>(`/internal/admin/catalog/methods/${id}`, body),
  adminDeleteMethod: (id: string) =>
    apiDelete<void>(`/internal/admin/catalog/methods/${id}`),
  adminSetMethodAvailability: (
    id: string,
    body: { scope: 'ALL_USERS' | 'WHITELIST'; userIds: string[] },
  ) =>
    apiPost<{ ok: true }>(`/internal/admin/catalog/methods/${id}/availability`, body),

  // ---- Stage 6: API requests & tasks (user) ----
  listApiRequests: (filters?: { page?: number; pageSize?: number }) =>
    apiGet<ApiRequestsPage>(`/internal/api-requests${qs({ ...filters })}`),
  getApiRequest: (id: string) =>
    apiGet<ApiRequestDetailView>(`/internal/api-requests/${id}`),
  listTasks: (filters?: { status?: TaskStatus; page?: number; pageSize?: number }) =>
    apiGet<TasksPage>(`/internal/tasks${qs({ ...filters })}`),
  getTask: (id: string) => apiGet<TaskView>(`/internal/tasks/${id}`),
};

// ---- Stage 5 types ----

export interface ModelView {
  id: string;
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder?: number;
  methods?: MethodView[];
}

export interface ProviderView {
  id: string;
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder: number;
  models?: ModelView[];
}

export interface MethodView {
  id: string;
  providerCode: string;
  modelCode: string;
  code: string;
  publicName: string;
  description?: string | null;
  parametersSchema: JsonSchemaLike;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  supportsSync: boolean;
  supportsAsync: boolean;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
  format?: string;
  bundleDimension?: boolean;
  items?: JsonSchemaProperty;
  default?: unknown;
}

export interface JsonSchemaLike {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
  [k: string]: unknown;
}

export type CatalogStatus = 'ACTIVE' | 'DISABLED' | 'DEPRECATED';

export interface ProviderAdminView {
  id: string;
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder: number;
  status: CatalogStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelAdminView {
  id: string;
  providerId: string;
  providerCode?: string;
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder: number;
  status: CatalogStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface AvailabilityView {
  scope: 'ALL_USERS' | 'WHITELIST';
  userIds: string[];
}

export interface MethodAdminView {
  id: string;
  modelId: string;
  providerCode?: string;
  modelCode?: string;
  code: string;
  publicName: string;
  description?: string | null;
  parametersSchema: JsonSchemaLike;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  supportsSync: boolean;
  supportsAsync: boolean;
  sortOrder: number;
  status: CatalogStatus;
  availability?: AvailabilityView;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProviderInput {
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface UpdateProviderInput {
  publicName?: string;
  description?: string | null;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface CreateModelInput {
  code: string;
  publicName: string;
  description?: string | null;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface UpdateModelInput {
  publicName?: string;
  description?: string | null;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface CreateMethodInput {
  code: string;
  publicName: string;
  description?: string | null;
  parametersSchema: JsonSchemaLike;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  supportsSync: boolean;
  supportsAsync: boolean;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface UpdateMethodInput {
  publicName?: string;
  description?: string | null;
  parametersSchema?: JsonSchemaLike;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  supportsSync?: boolean;
  supportsAsync?: boolean;
  sortOrder?: number;
  status?: CatalogStatus;
}

// ---- Stage 4 types ----

export type CouponType =
  | 'FIXED_AMOUNT'
  | 'BONUS_MONEY'
  | 'DISCOUNT_METHOD_PERCENT'
  | 'DISCOUNT_BUNDLE_AMOUNT'
  | 'DISCOUNT_TOPUP';

export type CouponStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'EXHAUSTED';

export interface CouponView {
  id: string;
  code: string;
  type: CouponType;
  value: string;
  currency?: string | null;
  methodCode?: string | null;
  bundleId?: string | null;
  minTopupUnits?: string | null;
  maxUses?: number | null;
  maxUsesPerUser: number;
  usesCount?: number;
  validFrom?: string | null;
  validTo?: string | null;
  status: CouponStatus;
  comment?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CouponValidationView {
  valid: true;
  couponId: string;
  type: CouponType;
  value: string;
  currency?: string | null;
  methodCode?: string | null;
  bundleId?: string | null;
  minTopupUnits?: string | null;
  previewBonusUnits?: string | null;
}

export interface CouponRedemptionView {
  id: string;
  couponCode: string;
  couponType: CouponType;
  amountUnits: string;
  apiRequestId?: string | null;
  depositId?: string | null;
  createdAt: string;
}

export interface CouponRedemptionsPage {
  items: CouponRedemptionView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CouponsPage {
  items: CouponView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCouponsFilters {
  type?: CouponType;
  status?: CouponStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminRedemptionsFilters {
  couponId?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: string;
  currency?: string;
  methodCode?: string;
  bundleId?: string;
  minTopupUnits?: string;
  maxUses?: number | null;
  maxUsesPerUser?: number;
  validFrom?: string | null;
  validTo?: string | null;
  status?: CouponStatus;
  comment?: string | null;
}

export interface UpdateCouponInput {
  status?: CouponStatus;
  validTo?: string | null;
  maxUses?: number | null;
  comment?: string | null;
}

// ---- Stage 6: API requests & tasks ----

export type ApiRequestStatus = 'ACCEPTED' | 'REJECTED' | 'FINALIZED';

export type TaskStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface ApiRequestView {
  id: string;
  methodCode: string;
  providerCode: string;
  modelCode: string;
  status: ApiRequestStatus;
  clientPriceUnits: string;
  currency: 'USD';
  errorCode?: string | null;
  callbackUrl?: string | null;
  taskId?: string | null;
  taskStatus?: TaskStatus | null;
  createdAt: string;
  finalizedAt?: string | null;
}

export interface ApiRequestDetailView extends ApiRequestView {
  paramsRaw?: unknown;
  pricingSnapshotId?: string | null;
  reservationId?: string | null;
  couponId?: string | null;
  basePriceUnits?: string | null;
  discountUnits?: string | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApiRequestsPage {
  items: ApiRequestView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TaskView {
  id: string;
  apiRequestId: string;
  methodCode: string;
  status: TaskStatus;
  mode: 'sync' | 'async' | string;
  errorCode?: string | null;
  errorMessage?: string | null;
  attempts: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface TasksPage {
  items: TaskView[];
  total: number;
  page: number;
  pageSize: number;
}

export { ApiError };
