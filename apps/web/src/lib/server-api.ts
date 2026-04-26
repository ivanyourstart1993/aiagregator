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

/** Wire-shape returned by backend (`{bundle: {...}, source, components}`). */
interface NestedEffectivePrice {
  bundle: {
    id: string;
    bundleKey: string;
    providerSlug: string;
    modelSlug: string;
    method: BundleMethod | string;
    mode: string | null;
    resolution: string | null;
    durationSeconds: number | null;
    aspectRatio: string | null;
    unit: PricingUnit;
    isActive: boolean;
  };
  source: PriceSource;
  sourceRefId: string;
  currency: 'USD';
  components: PriceComponents;
  marginBps?: number | null;
  computedAt?: string;
}

function flattenEffectivePrice(p: NestedEffectivePrice): EffectivePriceView {
  return {
    bundleKey: p.bundle.bundleKey,
    bundleId: p.bundle.id,
    provider: p.bundle.providerSlug,
    model: p.bundle.modelSlug,
    method: p.bundle.method,
    mode: p.bundle.mode,
    resolution: p.bundle.resolution,
    durationSeconds: p.bundle.durationSeconds,
    aspectRatio: p.bundle.aspectRatio,
    unit: p.bundle.unit,
    currency: p.currency,
    source: p.source,
    sourceRefId: p.sourceRefId,
    components: p.components,
    computedAt: p.computedAt ?? new Date().toISOString(),
  };
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
  // Backend returns rows with nested `bundle` object; flatten so UI keeps the
  // legacy `provider/model/method/...` shape from EffectivePriceView.
  getPricing: async (): Promise<EffectivePriceView[]> => {
    const raw = await apiGet<NestedEffectivePrice[]>('/internal/pricing');
    return raw.map(flattenEffectivePrice);
  },
  getPricingForBundle: async (bundleKey: string): Promise<EffectivePriceView> => {
    const raw = await apiGet<NestedEffectivePrice>(
      `/internal/pricing/bundle/${encodeURIComponent(bundleKey)}`,
    );
    return flattenEffectivePrice(raw);
  },
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

  // ---- Stage 7+11: Provider accounts ----
  adminListProviderAccounts: (filters?: ProviderAccountFilters) =>
    apiGet<ProviderAccountsPage>(`/internal/admin/providers/accounts${qs({ ...filters })}`),
  adminGetProviderAccount: (id: string) =>
    apiGet<ProviderAccountView>(`/internal/admin/providers/accounts/${id}`),
  adminCreateProviderAccount: (body: CreateProviderAccountInput) =>
    apiPost<ProviderAccountView>('/internal/admin/providers/accounts', body),
  adminUpdateProviderAccount: (id: string, body: UpdateProviderAccountInput) =>
    apiPatch<ProviderAccountView>(`/internal/admin/providers/accounts/${id}`, body),
  adminDeleteProviderAccount: (id: string) =>
    apiDelete<void>(`/internal/admin/providers/accounts/${id}`),
  adminEnableProviderAccount: (id: string) =>
    apiPost<{ ok: true }>(`/internal/admin/providers/accounts/${id}/enable`, {}),
  adminDisableProviderAccount: (id: string) =>
    apiPost<{ ok: true }>(`/internal/admin/providers/accounts/${id}/disable`, {}),
  adminGetProviderAccountStats: (id: string, filters?: { from?: string; to?: string }) =>
    apiGet<ProviderAccountStats>(
      `/internal/admin/providers/accounts/${id}/stats${qs({ ...filters })}`,
    ),

  // ---- Stage 7+11: Proxies ----
  adminListProxies: () => apiGet<ProxyView[] | { items: ProxyView[] }>('/internal/admin/providers/proxies'),
  adminGetProxy: (id: string) => apiGet<ProxyView>(`/internal/admin/providers/proxies/${id}`),
  adminCreateProxy: (body: CreateProxyInput) =>
    apiPost<ProxyView>('/internal/admin/providers/proxies', body),
  adminUpdateProxy: (id: string, body: UpdateProxyInput) =>
    apiPatch<ProxyView>(`/internal/admin/providers/proxies/${id}`, body),
  adminDeleteProxy: (id: string) =>
    apiDelete<void>(`/internal/admin/providers/proxies/${id}`),
  adminGetProxyStats: (id: string) =>
    apiGet<ProxyStats>(`/internal/admin/providers/proxies/${id}/stats`),

  // ---- Stage 12: Rate cards ----
  adminListRateCards: (filters?: RateCardFilters) =>
    apiGet<RateCardsPage>(`/internal/admin/rate-cards${qs({ ...filters })}`),
  adminGetRateCard: (id: string) => apiGet<RateCardView>(`/internal/admin/rate-cards/${id}`),
  adminCreateRateCard: (body: CreateRateCardInput) =>
    apiPost<RateCardView>('/internal/admin/rate-cards', body),
  adminUpdateRateCard: (id: string, body: UpdateRateCardInput) =>
    apiPatch<RateCardView>(`/internal/admin/rate-cards/${id}`, body),
  adminDeleteRateCard: (id: string) =>
    apiDelete<void>(`/internal/admin/rate-cards/${id}`),

  // ---- Stage 12: Analytics ----
  adminAnalyticsSummary: (filters?: { from?: string; to?: string }) =>
    apiGet<AnalyticsSummary>(`/internal/admin/analytics/summary${qs({ ...filters })}`),
  adminAnalyticsRevenueDaily: (filters?: { from?: string; to?: string }) =>
    apiGet<DailyPoint[]>(`/internal/admin/analytics/revenue/daily${qs({ ...filters })}`),
  adminAnalyticsCostByProvider: (filters?: { from?: string; to?: string }) =>
    apiGet<CostByProviderRow[]>(`/internal/admin/analytics/cost/by-provider${qs({ ...filters })}`),
  adminAnalyticsMargin: (filters?: { from?: string; to?: string }) =>
    apiGet<MarginRow>(`/internal/admin/analytics/margin${qs({ ...filters })}`),
  adminAnalyticsTopUsers: (filters?: { from?: string; to?: string; limit?: number }) =>
    apiGet<TopUserRow[]>(`/internal/admin/analytics/top-users${qs({ ...filters })}`),
  adminAnalyticsTopMethods: (filters?: { from?: string; to?: string; limit?: number }) =>
    apiGet<TopMethodRow[]>(`/internal/admin/analytics/top-methods${qs({ ...filters })}`),
  adminAnalyticsPerBundle: (filters?: { from?: string; to?: string }) =>
    apiGet<PerBundleRow[]>(`/internal/admin/analytics/per-bundle${qs({ ...filters })}`),

  // ---- Stage 10: DLQ ----
  adminListDlq: (queue: 'generation' | 'callback', filters?: { page?: number; pageSize?: number }) =>
    apiGet<DlqPage>(`/internal/admin/dlq/${queue}${qs({ ...filters })}`),
  adminRetryDlq: (queue: 'generation' | 'callback', jobId: string) =>
    apiPost<{ ok: true }>(`/internal/admin/dlq/${queue}/${jobId}/retry`, {}),
  adminDeleteDlq: (queue: 'generation' | 'callback', jobId: string) =>
    apiDelete<void>(`/internal/admin/dlq/${queue}/${jobId}`),

  // ---- Stage 13: Alerts ----
  adminListAlerts: (filters?: AlertFilters) =>
    apiGet<AlertsPage>(`/internal/admin/alerts${qs({ ...filters })}`),
  adminGetAlert: (id: string) => apiGet<AlertView>(`/internal/admin/alerts/${id}`),
  adminAcknowledgeAlert: (id: string) =>
    apiPost<{ ok: true }>(`/internal/admin/alerts/${id}/acknowledge`, {}),
  adminResolveAlert: (id: string) =>
    apiPost<{ ok: true }>(`/internal/admin/alerts/${id}/resolve`, {}),

  // ---- Stage 14: System settings + Load ----
  adminListSettings: () => apiGet<SystemSettingView[] | { items: SystemSettingView[] }>(
    '/internal/admin/settings',
  ),
  adminGetSetting: (key: string) =>
    apiGet<SystemSettingView>(`/internal/admin/settings/${encodeURIComponent(key)}`),
  adminUpdateSetting: (key: string, body: { value: unknown; comment?: string }) =>
    apiFetch<SystemSettingView>(`/internal/admin/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body,
    }),
  adminPauseGeneration: (paused: boolean) =>
    apiPost<{ ok: true }>(`/internal/admin/settings/pause/generation`, { paused }),
  adminPauseProvider: (code: string, paused: boolean) =>
    apiPost<{ ok: true }>(`/internal/admin/settings/pause/provider/${code}`, { paused }),
  adminPauseBundle: (key: string, paused: boolean) =>
    apiPost<{ ok: true }>(`/internal/admin/settings/pause/bundle/${encodeURIComponent(key)}`, {
      paused,
    }),
  adminLoadQueues: () => apiGet<QueuesLoad>(`/internal/admin/load/queues`),
  adminLoadRedis: () => apiGet<RedisLoad>(`/internal/admin/load/redis`),
  adminLoadDb: () => apiGet<DbLoad>(`/internal/admin/load/db`),

  // ---- Stage 15: Files ----
  adminListFiles: (filters?: FilesFilters) =>
    apiGet<FilesPage>(`/internal/admin/files${qs({ ...filters })}`),
  adminGetFile: (id: string) => apiGet<FileView>(`/internal/admin/files/${id}`),
  adminDeleteFileNow: (id: string) =>
    apiPost<{ ok: true }>(`/internal/admin/files/${id}/delete-now`, {}),

  // ---- Stage 16: Sandbox ----
  adminEnableSandbox: (userId: string) =>
    apiPost<{ ok: true }>(`/internal/admin/users/${userId}/sandbox/enable`, {}),
  adminDisableSandbox: (userId: string) =>
    apiPost<{ ok: true }>(`/internal/admin/users/${userId}/sandbox/disable`, {}),

  // ---- Stage 16: Exports (user-facing) ----
  listExports: () => apiGet<ExportView[] | { items: ExportView[] }>('/internal/exports'),
  getExport: (id: string) => apiGet<ExportView>(`/internal/exports/${id}`),
  createExport: (body: CreateExportInput) =>
    apiPost<ExportView>('/internal/exports', body),

  // ---- Stage 16: API key webhook secret ----
  rotateWebhookSecret: (id: string) =>
    apiPost<{ webhookSecret: string }>(`/internal/api-keys/${id}/rotate-webhook-secret`, {}),
};

// ---- Stage 7+11 types ----
export type ProxyProtocol = 'HTTP' | 'HTTPS' | 'SOCKS5';
export type ProxyStatus = 'ACTIVE' | 'DISABLED' | 'BROKEN';

export interface ProxyView {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: ProxyProtocol;
  login?: string | null;
  passwordLast4?: string | null;
  country?: string | null;
  region?: string | null;
  status: ProxyStatus;
  latencyMs?: number | null;
  lastCheckedAt?: string | null;
  createdAt?: string;
}

export interface CreateProxyInput {
  name: string;
  host: string;
  port: number;
  protocol: ProxyProtocol;
  login?: string;
  password?: string;
  country?: string;
  region?: string;
  status?: ProxyStatus;
}
export type UpdateProxyInput = Partial<CreateProxyInput>;

export interface ProxyStats {
  requestsToday?: number;
  failuresToday?: number;
  successRate?: number;
  avgLatencyMs?: number | null;
}

export type ProviderAccountStatus = 'ACTIVE' | 'DISABLED' | 'BROKEN' | 'EXHAUSTED';

export interface ProviderAccountView {
  id: string;
  providerId: string;
  providerCode?: string;
  name: string;
  description?: string | null;
  status: ProviderAccountStatus;
  proxyId?: string | null;
  proxy?: ProxyView | null;
  supportedModelIds?: string[];
  supportedMethodIds?: string[];
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  maxConcurrentTasks?: number | null;
  todayUsed?: number | null;
  monthUsed?: number | null;
  lastErrorCode?: string | null;
  lastErrorAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderAccountsPage {
  items: ProviderAccountView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderAccountFilters {
  providerId?: string;
  status?: ProviderAccountStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateProviderAccountInput {
  providerId: string;
  name: string;
  description?: string;
  credentials: Record<string, unknown>;
  proxyId?: string | null;
  supportedModelIds?: string[];
  supportedMethodIds?: string[];
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  maxConcurrentTasks?: number | null;
}
export interface UpdateProviderAccountInput {
  name?: string;
  description?: string;
  credentials?: Record<string, unknown>;
  proxyId?: string | null;
  supportedModelIds?: string[];
  supportedMethodIds?: string[];
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  maxConcurrentTasks?: number | null;
}

export interface ProviderAccountStats {
  requestsToday?: number;
  successToday?: number;
  failuresToday?: number;
  avgLatencyMs?: number | null;
  costToday?: string | null;
  byDay?: Array<{ date: string; requests: number; failures: number }>;
}

// ---- Stage 12: Rate cards ----
export type PriceType =
  | 'PER_REQUEST'
  | 'PER_SECOND'
  | 'PER_TOKEN_INPUT'
  | 'PER_TOKEN_OUTPUT'
  | 'PER_IMAGE'
  | 'CUSTOM';

export interface RateCardView {
  id: string;
  providerId: string;
  providerCode?: string;
  modelId?: string | null;
  modelCode?: string | null;
  methodId?: string | null;
  methodCode?: string | null;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  priceType: PriceType;
  providerCostUnits?: string | null;
  pricePerSecond?: string | null;
  pricePerImage?: string | null;
  pricePerTokenInput?: string | null;
  pricePerTokenOutput?: string | null;
  isActive: boolean;
  effectiveFrom?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RateCardsPage {
  items: RateCardView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RateCardFilters {
  providerId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateRateCardInput {
  providerId: string;
  modelId?: string;
  methodId?: string;
  mode?: string;
  resolution?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  priceType: PriceType;
  providerCostUnits?: string;
  pricePerSecond?: string;
  pricePerImage?: string;
  pricePerTokenInput?: string;
  pricePerTokenOutput?: string;
  isActive?: boolean;
}
export type UpdateRateCardInput = Partial<CreateRateCardInput>;

// ---- Stage 12: Analytics ----
export interface AnalyticsSummary {
  revenueUnits: string;
  costUnits: string;
  marginUnits: string;
  marginBps?: number;
  requestsCount: number;
  tasksCount?: number;
  successRate?: number;
  from: string;
  to: string;
}

export interface DailyPoint {
  date: string;
  revenueUnits: string;
  costUnits?: string;
  marginUnits?: string;
  requestsCount?: number;
}

export interface CostByProviderRow {
  providerCode: string;
  costUnits: string;
  requestsCount: number;
}

export interface MarginRow {
  marginUnits: string;
  marginBps: number;
  revenueUnits: string;
  costUnits: string;
}

export interface TopUserRow {
  userId: string;
  email?: string | null;
  revenueUnits: string;
  requestsCount: number;
}

export interface TopMethodRow {
  methodCode: string;
  providerCode?: string;
  modelCode?: string;
  revenueUnits: string;
  requestsCount: number;
}

export interface PerBundleRow {
  bundleKey: string;
  providerCode?: string;
  modelCode?: string;
  methodCode?: string;
  revenueUnits: string;
  costUnits?: string;
  marginUnits?: string;
  requestsCount: number;
}

// ---- Stage 10: DLQ ----
export interface DlqJob {
  id: string;
  jobId: string;
  failedAt: string;
  reason?: string | null;
  attempts?: number;
  data?: unknown;
}
export interface DlqPage {
  items: DlqJob[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Stage 13: Alerts ----
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertCategory =
  | 'PROVIDER_FAILURE'
  | 'PROXY_FAILURE'
  | 'BALANCE_LOW'
  | 'QUEUE_OVERLOAD'
  | 'COST_SPIKE'
  | 'OTHER';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlertView {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  status: AlertStatus;
  title: string;
  message?: string | null;
  source?: string | null;
  context?: Record<string, unknown> | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
}

export interface AlertsPage {
  items: AlertView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AlertFilters {
  status?: AlertStatus;
  severity?: AlertSeverity;
  category?: AlertCategory;
  page?: number;
  pageSize?: number;
}

// ---- Stage 14 ----
export interface SystemSettingView {
  key: string;
  value: unknown;
  comment?: string | null;
  updatedAt?: string;
  updatedById?: string | null;
}

export interface QueueCounters {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: number;
}
export interface QueuesLoad {
  generation?: QueueCounters;
  callback?: QueueCounters;
  [key: string]: QueueCounters | undefined;
}

export interface RedisLoad {
  connected: boolean;
  usedMemoryBytes?: number;
  ops?: number;
  clients?: number;
  uptimeSeconds?: number;
}

export interface DbLoad {
  taskCounts?: Record<string, number>;
  reservationCount?: number;
  pendingDeposits?: number;
}

// ---- Stage 15 ----
export type ResultFileStatus = 'PENDING' | 'STORED' | 'EXPIRED' | 'DELETED';

export interface FileView {
  id: string;
  userId: string;
  userEmail?: string | null;
  taskId?: string | null;
  url?: string | null;
  status: ResultFileStatus;
  sizeBytes?: number | null;
  contentType?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}
export interface FilesPage {
  items: FileView[];
  total: number;
  page: number;
  pageSize: number;
}
export interface FilesFilters {
  userId?: string;
  status?: ResultFileStatus;
  page?: number;
  pageSize?: number;
}

// ---- Stage 16: Exports ----
export type ExportType = 'TRANSACTIONS' | 'REQUESTS' | 'TASKS' | 'DEPOSITS';
export type ExportFormat = 'csv' | 'json';
export type ExportStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'EXPIRED';

export interface ExportView {
  id: string;
  type: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  fileUrl?: string | null;
  rowsCount?: number | null;
  errorMessage?: string | null;
  filter?: { from?: string | null; to?: string | null } | null;
  createdAt: string;
  finishedAt?: string | null;
  expiresAt?: string | null;
}

export interface CreateExportInput {
  type: ExportType;
  format: ExportFormat;
  filter?: { from?: string; to?: string };
}

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
