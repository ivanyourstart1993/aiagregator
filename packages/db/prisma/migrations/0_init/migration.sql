-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD');

-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('MAIN', 'BONUS');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'DEBIT', 'REFUND', 'CORRECTION', 'BONUS_GRANT', 'BONUS_CORRECTION', 'COUPON_DISCOUNT', 'RESERVATION_HOLD', 'RESERVATION_RELEASE', 'RESERVATION_CAPTURE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CAPTURED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('CREATED', 'PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CRYPTOMUS');

-- CreateEnum
CREATE TYPE "BundleMethod" AS ENUM ('TEXT_GENERATION', 'IMAGE_GENERATION', 'IMAGE_EDIT', 'VIDEO_GENERATION', 'AUDIO_TRANSCRIPTION', 'AUDIO_GENERATION', 'EMBEDDING', 'OTHER');

-- CreateEnum
CREATE TYPE "BundleUnit" AS ENUM ('PER_REQUEST', 'PER_TOKEN_INPUT', 'PER_TOKEN_OUTPUT', 'PER_SECOND', 'PER_IMAGE');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('USER_BUNDLE_OVERRIDE', 'USER_TARIFF', 'DEFAULT_TARIFF');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('FIXED_AMOUNT', 'BONUS_MONEY', 'DISCOUNT_METHOD_PERCENT', 'DISCOUNT_BUNDLE_AMOUNT', 'DISCOUNT_TOPUP');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "AvailabilityScope" AS ENUM ('ALL_USERS', 'WHITELIST');

-- CreateEnum
CREATE TYPE "ApiRequestStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskMode" AS ENUM ('SYNC', 'ASYNC');

-- CreateEnum
CREATE TYPE "ProviderAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MANUALLY_DISABLED', 'EXCLUDED_BY_BILLING', 'QUOTA_EXHAUSTED', 'LIMIT_REACHED', 'INVALID_CREDENTIALS', 'PROXY_ERROR', 'COOLDOWN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProxyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'COOLDOWN', 'MANUALLY_DISABLED');

-- CreateEnum
CREATE TYPE "ProxyProtocol" AS ENUM ('HTTP', 'HTTPS', 'SOCKS5');

-- CreateEnum
CREATE TYPE "ResultFileStatus" AS ENUM ('AVAILABLE', 'EXPIRED', 'DELETED', 'DELETION_FAILED');

-- CreateEnum
CREATE TYPE "RateCardPriceType" AS ENUM ('PER_REQUEST', 'PER_SECOND', 'PER_TOKEN_INPUT', 'PER_TOKEN_OUTPUT', 'PER_IMAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('ACCOUNT_BILLING', 'ACCOUNT_QUOTA', 'ACCOUNT_BLOCKED', 'ACCOUNT_INVALID_CREDENTIALS', 'PROXY_DOWN', 'HIGH_FAILURE_RATE', 'QUEUE_BACKLOG', 'PROVIDER_NO_ACCOUNTS', 'STORAGE_FULL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('TRANSACTIONS', 'REQUESTS', 'TASKS', 'DEPOSITS');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "sandboxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "type" "VerificationTokenType" NOT NULL DEFAULT 'EMAIL_VERIFY'
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_action" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "kind" "WalletKind" NOT NULL DEFAULT 'MAIN',
    "availableUnits" BIGINT NOT NULL DEFAULT 0,
    "reservedUnits" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "amountUnits" BIGINT NOT NULL,
    "balanceAfterUnits" BIGINT NOT NULL,
    "reservedAfterUnits" BIGINT NOT NULL,
    "reservationId" TEXT,
    "depositId" TEXT,
    "parentTransactionId" TEXT,
    "taskId" TEXT,
    "bundleKey" TEXT,
    "pricingSnapshotId" TEXT,
    "adminId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "idempotencyScope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "amountUnits" BIGINT NOT NULL,
    "capturedUnits" BIGINT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT,
    "bundleKey" TEXT,
    "pricingSnapshotId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalInvoiceId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'CREATED',
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "amountUnits" BIGINT NOT NULL,
    "amountAsked" DECIMAL(20,8) NOT NULL,
    "paidAmount" DECIMAL(20,8),
    "paidCurrency" TEXT,
    "txid" TEXT,
    "payUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rawCreatePayload" JSONB NOT NULL,
    "rawWebhookPayloads" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "couponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "responseStatus" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle" (
    "id" TEXT NOT NULL,
    "providerSlug" TEXT NOT NULL,
    "modelSlug" TEXT NOT NULL,
    "method" "BundleMethod" NOT NULL,
    "mode" TEXT,
    "resolution" TEXT,
    "durationSeconds" INTEGER,
    "aspectRatio" TEXT,
    "bundleKey" TEXT NOT NULL,
    "unit" "BundleUnit" NOT NULL DEFAULT 'PER_REQUEST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_bundle_price" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "basePriceUnits" BIGINT,
    "inputPerTokenUnits" BIGINT,
    "outputPerTokenUnits" BIGINT,
    "perSecondUnits" BIGINT,
    "perImageUnits" BIGINT,
    "providerCostUnits" BIGINT,
    "marginBps" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_bundle_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tariff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "assignedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bundle_price" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "basePriceUnits" BIGINT,
    "inputPerTokenUnits" BIGINT,
    "outputPerTokenUnits" BIGINT,
    "perSecondUnits" BIGINT,
    "perImageUnits" BIGINT,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "reason" TEXT,
    "setById" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bundle_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "bundleKey" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "sourceRefId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "basePriceUnits" BIGINT,
    "inputPerTokenUnits" BIGINT,
    "outputPerTokenUnits" BIGINT,
    "perSecondUnits" BIGINT,
    "perImageUnits" BIGINT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_change_log" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT,
    "userId" TEXT,
    "bundleId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariff_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "methodCode" TEXT,
    "bundleId" TEXT,
    "minTopupUnits" BIGINT,
    "maxUses" INTEGER,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiRequestId" TEXT,
    "depositId" TEXT,
    "amountUnits" BIGINT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "method" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "description" TEXT,
    "parametersSchema" JSONB NOT NULL,
    "exampleRequest" JSONB,
    "exampleResponse" JSONB,
    "supportsSync" BOOLEAN NOT NULL DEFAULT false,
    "supportsAsync" BOOLEAN NOT NULL DEFAULT true,
    "availability" "AvailabilityScope" NOT NULL DEFAULT 'ALL_USERS',
    "availabilityUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "idempotencyKey" TEXT,
    "methodId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "bundleKey" TEXT NOT NULL,
    "paramsRaw" JSONB NOT NULL,
    "status" "ApiRequestStatus" NOT NULL DEFAULT 'ACCEPTED',
    "basePriceUnits" BIGINT NOT NULL,
    "discountUnits" BIGINT NOT NULL DEFAULT 0,
    "clientPriceUnits" BIGINT NOT NULL,
    "pricingSnapshotId" TEXT,
    "reservationId" TEXT,
    "couponId" TEXT,
    "callbackUrl" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "api_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "apiRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "TaskMode" NOT NULL DEFAULT 'ASYNC',
    "providerJobId" TEXT,
    "resultData" JSONB,
    "resultFiles" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" "ProxyProtocol" NOT NULL DEFAULT 'HTTP',
    "login" TEXT,
    "passwordHash" TEXT,
    "country" TEXT,
    "region" TEXT,
    "status" "ProxyStatus" NOT NULL DEFAULT 'ACTIVE',
    "comment" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "externalIp" TEXT,
    "latencyMs" INTEGER,
    "maxConcurrentTasks" INTEGER,
    "maxRequestsPerMinute" INTEGER,
    "maxRequestsPerHour" INTEGER,
    "cooldownAfterErrors" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_account" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credentials" JSONB NOT NULL,
    "proxyId" TEXT,
    "status" "ProviderAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER,
    "monthlyLimit" INTEGER,
    "maxConcurrentTasks" INTEGER DEFAULT 3,
    "maxRequestsPerMinute" INTEGER,
    "maxRequestsPerHour" INTEGER,
    "maxRequestsPerDay" INTEGER,
    "maxCostPerDayUnits" BIGINT,
    "maxCostPerMonthUnits" BIGINT,
    "supportedModelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedMethodIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "excludedReason" TEXT,
    "todayRequestsCount" INTEGER NOT NULL DEFAULT 0,
    "todayCostUnits" BIGINT NOT NULL DEFAULT 0,
    "monthRequestsCount" INTEGER NOT NULL DEFAULT 0,
    "monthCostUnits" BIGINT NOT NULL DEFAULT 0,
    "countersResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_attempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "providerId" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "proxyId" TEXT,
    "status" TEXT NOT NULL,
    "errorType" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerJobId" TEXT,
    "providerCostUnits" BIGINT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "provider_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_file" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "apiRequestId" TEXT,
    "userId" TEXT NOT NULL,
    "providerSlug" TEXT NOT NULL,
    "modelSlug" TEXT NOT NULL,
    "methodCode" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "fileType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DECIMAL(10,3),
    "status" "ResultFileStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_rate_card" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT,
    "methodId" TEXT,
    "mode" TEXT,
    "resolution" TEXT,
    "durationSeconds" INTEGER,
    "aspectRatio" TEXT,
    "priceType" "RateCardPriceType" NOT NULL,
    "providerCostUnits" BIGINT,
    "providerUnitCost" BIGINT,
    "pricePerSecond" BIGINT,
    "pricePerImage" BIGINT,
    "pricePerTokenInput" BIGINT,
    "pricePerTokenOutput" BIGINT,
    "batchDiscount" INTEGER,
    "priorityMultiplier" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "providerCurrency" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_rate_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "apiRequestId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "signature" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" TEXT NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "comment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "export" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ExportType" NOT NULL,
    "format" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER,
    "fileUrl" TEXT,
    "fileSize" BIGINT,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_providerAccountId_key" ON "account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "session_sessionToken_key" ON "session"("sessionToken");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_token_key" ON "verification_token"("token");

-- CreateIndex
CREATE INDEX "verification_token_identifier_idx" ON "verification_token"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_identifier_token_key" ON "verification_token"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_prefix_key" ON "api_key"("prefix");

-- CreateIndex
CREATE INDEX "api_key_userId_idx" ON "api_key"("userId");

-- CreateIndex
CREATE INDEX "api_key_status_idx" ON "api_key"("status");

-- CreateIndex
CREATE INDEX "admin_action_actorId_createdAt_idx" ON "admin_action"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_action_targetType_targetId_idx" ON "admin_action"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_action_createdAt_idx" ON "admin_action"("createdAt");

-- CreateIndex
CREATE INDEX "wallet_userId_idx" ON "wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_userId_currency_kind_key" ON "wallet"("userId", "currency", "kind");

-- CreateIndex
CREATE INDEX "transaction_userId_createdAt_idx" ON "transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "transaction_walletId_createdAt_idx" ON "transaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "transaction_type_createdAt_idx" ON "transaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "transaction_taskId_idx" ON "transaction"("taskId");

-- CreateIndex
CREATE INDEX "transaction_depositId_idx" ON "transaction"("depositId");

-- CreateIndex
CREATE INDEX "transaction_reservationId_idx" ON "transaction"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_idempotencyScope_idempotencyKey_key" ON "transaction"("idempotencyScope", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_idempotencyKey_key" ON "reservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reservation_userId_status_idx" ON "reservation"("userId", "status");

-- CreateIndex
CREATE INDEX "reservation_taskId_idx" ON "reservation"("taskId");

-- CreateIndex
CREATE INDEX "reservation_expiresAt_status_idx" ON "reservation"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "deposit_userId_createdAt_idx" ON "deposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "deposit_status_idx" ON "deposit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_provider_externalInvoiceId_key" ON "deposit"("provider", "externalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_provider_externalOrderId_key" ON "deposit"("provider", "externalOrderId");

-- CreateIndex
CREATE INDEX "idempotency_record_createdAt_idx" ON "idempotency_record"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_scope_key_key" ON "idempotency_record"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_bundleKey_key" ON "bundle"("bundleKey");

-- CreateIndex
CREATE INDEX "bundle_providerSlug_modelSlug_idx" ON "bundle"("providerSlug", "modelSlug");

-- CreateIndex
CREATE INDEX "bundle_method_isActive_idx" ON "bundle"("method", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_slug_key" ON "tariff"("slug");

-- CreateIndex
CREATE INDEX "tariff_isDefault_idx" ON "tariff"("isDefault");

-- CreateIndex
CREATE INDEX "tariff_isActive_idx" ON "tariff"("isActive");

-- CreateIndex
CREATE INDEX "tariff_bundle_price_bundleId_idx" ON "tariff_bundle_price"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_bundle_price_tariffId_bundleId_key" ON "tariff_bundle_price"("tariffId", "bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tariff_userId_key" ON "user_tariff"("userId");

-- CreateIndex
CREATE INDEX "user_tariff_tariffId_idx" ON "user_tariff"("tariffId");

-- CreateIndex
CREATE INDEX "user_bundle_price_bundleId_idx" ON "user_bundle_price"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_bundle_price_userId_bundleId_key" ON "user_bundle_price"("userId", "bundleId");

-- CreateIndex
CREATE INDEX "pricing_snapshot_userId_bundleKey_idx" ON "pricing_snapshot"("userId", "bundleKey");

-- CreateIndex
CREATE INDEX "pricing_snapshot_computedAt_idx" ON "pricing_snapshot"("computedAt");

-- CreateIndex
CREATE INDEX "tariff_change_log_tariffId_createdAt_idx" ON "tariff_change_log"("tariffId", "createdAt");

-- CreateIndex
CREATE INDEX "tariff_change_log_userId_createdAt_idx" ON "tariff_change_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "tariff_change_log_bundleId_createdAt_idx" ON "tariff_change_log"("bundleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");

-- CreateIndex
CREATE INDEX "coupon_status_validFrom_validTo_idx" ON "coupon"("status", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "coupon_redemption_couponId_createdAt_idx" ON "coupon_redemption"("couponId", "createdAt");

-- CreateIndex
CREATE INDEX "coupon_redemption_userId_createdAt_idx" ON "coupon_redemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "coupon_redemption_depositId_idx" ON "coupon_redemption"("depositId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_code_key" ON "provider"("code");

-- CreateIndex
CREATE INDEX "provider_status_idx" ON "provider"("status");

-- CreateIndex
CREATE INDEX "model_status_idx" ON "model"("status");

-- CreateIndex
CREATE UNIQUE INDEX "model_providerId_code_key" ON "model"("providerId", "code");

-- CreateIndex
CREATE INDEX "method_status_availability_idx" ON "method"("status", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "method_providerId_modelId_code_key" ON "method"("providerId", "modelId", "code");

-- CreateIndex
CREATE INDEX "api_request_userId_createdAt_idx" ON "api_request"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_request_methodId_createdAt_idx" ON "api_request"("methodId", "createdAt");

-- CreateIndex
CREATE INDEX "api_request_apiKeyId_createdAt_idx" ON "api_request"("apiKeyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_apiRequestId_key" ON "task"("apiRequestId");

-- CreateIndex
CREATE INDEX "task_userId_status_createdAt_idx" ON "task"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "task_status_createdAt_idx" ON "task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "proxy_status_idx" ON "proxy"("status");

-- CreateIndex
CREATE INDEX "provider_account_providerId_status_idx" ON "provider_account"("providerId", "status");

-- CreateIndex
CREATE INDEX "provider_account_status_rotationEnabled_idx" ON "provider_account"("status", "rotationEnabled");

-- CreateIndex
CREATE INDEX "provider_attempt_taskId_attemptNumber_idx" ON "provider_attempt"("taskId", "attemptNumber");

-- CreateIndex
CREATE INDEX "provider_attempt_providerAccountId_startedAt_idx" ON "provider_attempt"("providerAccountId", "startedAt");

-- CreateIndex
CREATE INDEX "provider_attempt_status_idx" ON "provider_attempt"("status");

-- CreateIndex
CREATE INDEX "result_file_userId_createdAt_idx" ON "result_file"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "result_file_taskId_idx" ON "result_file"("taskId");

-- CreateIndex
CREATE INDEX "result_file_status_expiresAt_idx" ON "result_file"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "provider_rate_card_providerId_modelId_methodId_status_idx" ON "provider_rate_card"("providerId", "modelId", "methodId", "status");

-- CreateIndex
CREATE INDEX "provider_rate_card_validFrom_validTo_idx" ON "provider_rate_card"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "webhook_delivery_apiRequestId_idx" ON "webhook_delivery"("apiRequestId");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_createdAt_idx" ON "webhook_delivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_dedupeKey_key" ON "alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "alert_status_severity_createdAt_idx" ON "alert"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "alert_category_status_idx" ON "alert"("category", "status");

-- CreateIndex
CREATE INDEX "export_userId_createdAt_idx" ON "export"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "export_status_idx" ON "export"("status");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action" ADD CONSTRAINT "admin_action_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_parentTransactionId_fkey" FOREIGN KEY ("parentTransactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_pricingSnapshotId_fkey" FOREIGN KEY ("pricingSnapshotId") REFERENCES "pricing_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_pricingSnapshotId_fkey" FOREIGN KEY ("pricingSnapshotId") REFERENCES "pricing_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_bundle_price" ADD CONSTRAINT "tariff_bundle_price_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_bundle_price" ADD CONSTRAINT "tariff_bundle_price_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tariff" ADD CONSTRAINT "user_tariff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tariff" ADD CONSTRAINT "user_tariff_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tariff" ADD CONSTRAINT "user_tariff_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bundle_price" ADD CONSTRAINT "user_bundle_price_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bundle_price" ADD CONSTRAINT "user_bundle_price_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bundle_price" ADD CONSTRAINT "user_bundle_price_setById_fkey" FOREIGN KEY ("setById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_snapshot" ADD CONSTRAINT "pricing_snapshot_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_change_log" ADD CONSTRAINT "tariff_change_log_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_change_log" ADD CONSTRAINT "tariff_change_log_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model" ADD CONSTRAINT "model_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method" ADD CONSTRAINT "method_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method" ADD CONSTRAINT "method_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request" ADD CONSTRAINT "api_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_apiRequestId_fkey" FOREIGN KEY ("apiRequestId") REFERENCES "api_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_account" ADD CONSTRAINT "provider_account_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_account" ADD CONSTRAINT "provider_account_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "proxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_attempt" ADD CONSTRAINT "provider_attempt_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "provider_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_rate_card" ADD CONSTRAINT "provider_rate_card_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Manual constraints
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_available_units_nonneg" CHECK ("availableUnits" >= 0);
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_reserved_units_nonneg" CHECK ("reservedUnits" >= 0);
CREATE UNIQUE INDEX "tariff_only_one_default" ON "tariff"("isDefault") WHERE "isDefault" = TRUE;
CREATE UNIQUE INDEX "coupon_redemption_request_unique" ON "coupon_redemption"("couponId","userId","apiRequestId") WHERE "apiRequestId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_deposit_unique" ON "coupon_redemption"("couponId","userId","depositId") WHERE "depositId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_standalone_unique" ON "coupon_redemption"("couponId","userId") WHERE "apiRequestId" IS NULL AND "depositId" IS NULL;
