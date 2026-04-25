# AI API Aggregator

Единый API-фасад над внешними AI-провайдерами (Google Banana / Gemini Image, Google Veo 3 / 3.1, Kling AI). Биллинг в реальных USD, индивидуальные цены, очередь задач, пул аккаунтов провайдеров, proxy layer.

> **Status:** Этапы 1–6 реализованы (фундамент + биллинг + цены + купоны + каталог + публичный API). Stub-воркер `provider_not_implemented` дает E2E-flow без подключённых провайдеров. План полной реализации Stages 7–16: см. `~/.claude/plans/serene-giggling-cascade.md`.
>
> Локально не запускался end-to-end: нет Docker (Postgres/Redis/MinIO/Mailpit). Все верификации — `pnpm typecheck` (9/9), `pnpm lint` (6/6), `pnpm --filter @aiagg/web build`. NestJS API инициализирует все 28 модулей при старте; падение только на реальном Redis-коннекте (ожидаемо).

## Tech stack

- **Backend:** NestJS 10 + TypeScript + Prisma 6 + PostgreSQL 16 + BullMQ (Redis 7)
- **Frontend:** Next.js 14 (App Router) + Tailwind + shadcn/ui + next-intl (EN + RU)
- **Auth:** Auth.js (NextAuth v5) + JWT HS256, валидируется в NestJS общим секретом
- **Email:** Resend (prod) + Mailpit (dev) через React Email
- **Crypto pay:** Cryptomus (с расширяемым `PaymentProvider`-интерфейсом)
- **Storage:** MinIO / S3-compatible (Этап 7+)
- **Hosting:** Northflank (api / web / worker + addons); proxy layer — отдельные VPS

## Workspaces

```
apps/
  api/      # NestJS REST (port 4000): /v1/* публичные, /internal/* для фронта, /webhooks/*
  web/      # Next.js (port 3000): лендинг, кабинет, админка, /docs (автоген из каталога)
  worker/   # BullMQ standalone: stub-generation processor + email + reservation-expiry
packages/
  db/                # Единый Prisma schema + PrismaClient re-export (15 моделей, 18 enums)
  shared/            # Zod-схемы, error-codes, money helpers (BigInt nano-USD), bundle-key
  email-templates/   # React Email компоненты
  tsconfig/          # Общие tsconfig пресеты (base, nest, next, node, react)
  eslint-config/     # Общие ESLint flat-config пресеты
infra/
  docker-compose.yml # Postgres + Redis + MinIO + Mailpit для local dev
  northflank/        # Deployment guide
apps/{api,web,worker}/Dockerfile  # Multi-stage builds для Northflank
```

## Что реализовано (Stages 1–6)

### Stage 1 — Фундамент
- Регистрация, верификация email через Resend, login email/password, Google OAuth
- API-ключи `sk_live_<prefix:12>_<secret:24>`, argon2id+pepper, prefix-индекс для O(1) lookup
- JWT HS256 общий между NextAuth и NestJS, jose-кастомизация encode/decode
- 6 моделей: User, Account, Session, VerificationToken, ApiKey, AdminAction
- Кабинет и админка с sidebar, layout-группы, role guards

### Stage 2 — Биллинг
- Wallet (MAIN+BONUS), Transaction (10 типов), Reservation, Deposit, IdempotencyRecord
- Все суммы в BigInt nano-USD (cents × 1e6) — точность для per-second pricing
- BillingService: credit/debit/correct/grantBonus/reserve/capture/release с Serializable tx + FOR UPDATE row lock + version bump
- IdempotencyService: универсальный run(scope, key, fn) с DB-mirror
- Cryptomus: invoice + webhook со MD5 signature + IP allowlist; PaymentProvider-интерфейс для будущих
- Cabinet: Balance с 4 карточками + transactions table с фильтрами + Top-up flow с polling
- Admin: Billing dashboard + Transactions feed + Deposits + User WalletPanel с modal-actions

### Stage 3 — Цены
- Bundle (нормализация связки через SHA256-hash), Tariff, TariffBundlePrice, UserTariff, UserBundlePrice, PricingSnapshot, TariffChangeLog
- PricingService: priority `UserBundleOverride > UserTariff > DefaultTariff` с Redis cache (60s TTL) + event-driven invalidation
- Snapshot для immutability — старые операции не пересчитываются
- Cabinet: Pricing с фильтрами + source-badges
- Admin: Tariffs CRUD + inline-editable BundlePricesGrid + bulk CSV import + Bundles catalog + ChangeLog feed + User pricing tab

### Stage 4 — Купоны
- 5 типов: FIXED_AMOUNT, BONUS_MONEY, DISCOUNT_METHOD_PERCENT, DISCOUNT_BUNDLE_AMOUNT, DISCOUNT_TOPUP
- Coupon + CouponRedemption с partial unique indexes (request / deposit / standalone)
- CouponsService: validate (lazy status-sync), redeemStandalone (in-tx), previewRequestDiscount (pure), commitRequestRedemption, applyTopupBonus
- Wired в Cryptomus webhook для top-up бонусов
- Cabinet: Apply form + history. Top-up form с coupon + validate-preview
- Admin: CRUD coupons с type-conditional полями + redemption history

### Stage 5 — Каталог
- Provider, Model, Method (с JSON Schema parametersSchema, exampleRequest/Response, availability ALL_USERS/WHITELIST)
- CatalogService: resolveAndCheck, validateParamsOrThrow (Ajv с per-method кэшем), assertAvailableForUser
- BundleSpecService: findOrCreateFromRequest — извлекает x-bundle-dim поля из schema → строит каноничный BundleSpec
- Seed: 3 провайдера, 10 моделей, ~50 методов из ТЗ §13 (Banana 8, Veo 25, Kling 24)
- Public `/docs` автогенерируется из каталога с навигацией Provider→Model→Method, Parameters table, examples (без цен)
- Admin Catalog: трёхколоночный tree, Monaco-like JSON Schema editor, AvailabilityPanel

### Stage 6 — Публичный API
- ApiRequest + Task модели; PublicApiModule под `/v1/*`
- Endpoints: GET /v1/methods, /v1/prices, /v1/balance; POST /v1/estimate, /v1/generations; GET /v1/tasks/:id, /v1/tasks/:id/result
- PublicApiKeyGuard (Redis cache 60s + argon2 verify + timing-safe fallback + debounced lastUsedAt)
- RateLimitGuard (sliding window, 60/min + 1000/day, X-RateLimit-* headers)
- IdempotencyInterceptor (state machine in_progress→done, Redis 24h + DB mirror, replay header)
- GenerationsService.admit: catalog → validateParams → bundleSpec → resolvePrice → coupon → reserve → ApiRequest → Task → enqueue
- Stub worker в apps/worker: 1s sleep → Task FAILED `provider_not_implemented` → release reservation
- Task sweeper cron (каждые 30s): re-enqueue stuck PENDING tasks
- Cabinet: API Explorer (cURL builder + paste-key) + Charges + Requests history с детальной view

## Local setup

### Pre-requisites
- Node.js ≥ 20 (см. `.nvmrc`)
- pnpm 9.15+ (через `corepack enable pnpm`)
- Docker + Docker Compose (для dev-инфры) — **не установлен на машине, нужно поставить**
- (Опционально) GitHub CLI `gh` для создания приватного репо

### Bootstrap

```bash
# 1. Установка зависимостей (уже выполнено)
pnpm install

# 2. Настроить .env.local
cp .env.example .env.local
# Сгенерировать секреты:
openssl rand -base64 64  # → AUTH_JWT_SECRET / NEXTAUTH_SECRET
openssl rand -base64 32  # → API_KEY_PEPPER

# 3. Поднять dev-инфру
docker compose -f infra/docker-compose.yml up -d
# Postgres: 5432 | Redis: 6379 | MinIO: 9000 (console 9001) | Mailpit SMTP: 1025 (UI 8025)

# 4. Prisma миграции + seed
pnpm db:generate
pnpm db:migrate    # создаст таблицы из packages/db/prisma/migrations/0_init/migration.sql
pnpm db:seed       # super_admin + initial-catalog (3 провайдера × методы)

# 5. Запустить всё
pnpm dev
# api:    http://localhost:4000/health
# web:    http://localhost:3000
# worker: BullMQ stub-generation processor
```

### Полезные команды

```bash
pnpm typecheck   # tsc --noEmit во всех 9 workspaces (~9 tasks)
pnpm lint        # eslint во всех 6 (~6 tasks)
pnpm format      # prettier
pnpm build       # turbo build всех приложений
pnpm test        # vitest (есть unit-тесты в @aiagg/shared/money)
```

## Northflank deploy

См. `infra/northflank/README.md`.

**Pre-requisites (нужны действия пользователя):**
1. **Git identity** — глобально `git config --global user.email "..."` + `user.name "..."`. Сейчас не настроено.
2. **GitHub repo** — `gh repo create aiagregator --private --source=. --push`. CLI `gh` не установлен; либо ставим (`brew install gh` + `gh auth login`), либо создаём руками на github.com и `git remote add origin git@github.com:<user>/aiagregator.git && git push -u origin main`.
3. **Northflank**:
   - Создать project `aiagregator`
   - Подключить GitHub-репо
   - Создать addons: PostgreSQL, Redis, MinIO
   - Создать Secret Groups (см. `infra/northflank/README.md`)
   - Создать 3 Build Services из Dockerfile:
     - `api-service` → `apps/api/Dockerfile`, port 4000, healthcheck `/health`
     - `frontend-service` → `apps/web/Dockerfile`, port 3000
     - `worker-service` → `apps/worker/Dockerfile`, без порта
   - Создать Job: `db-migrations` runs `pnpm --filter @aiagg/db prisma:migrate:deploy`
   - Создать One-off: `db-seed` runs `pnpm --filter @aiagg/db seed`

## Что осталось (Stages 7–16)

| Этап | Содержание |
|------|-----------|
| 7 | Google Banana / Gemini Image adapter, MinIO storage, image generation worker |
| 8 | Google Veo 3 / 3.1 adapter, polling LRO, video upload в MinIO |
| 9 | Kling AI adapter, своя единица расхода → внутренняя rate card |
| 10 | Полная очередь, retry, dead letter, callback dispatch с HMAC |
| 11 | ProviderAccount, прокси, multi-account ротация, billing-error switch, health checks |
| 12 | Cost/margin аналитика, ProviderRateCard |
| 13 | External account quotas, alerts |
| 14 | Load monitoring, queue settings, pause provider/bundle/proxy |
| 15 | MinIO storage policy: 30 дней + cleanup cron |
| 16 | Sandbox, экспорт history, support, webhook security final, anti-abuse |

Архитектура Stages 1–6 спроектирована модульно: provider adapters реализуют общий `ProviderAdapter`-интерфейс, ProviderAccount/Proxy подключаются как новые сущности с FK на Bundle, callback worker подцепляется к event'у `task.completed`. Stub-воркер заменяется реальным без изменения admit-логики.

## License

Private / proprietary.
