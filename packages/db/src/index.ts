// Re-export PrismaClient так, чтобы apps импортировали через @aiagg/db
// и не зависели напрямую от @prisma/client.
//
// Re-export values (PrismaClient class, Prisma namespace и runtime enums) +
// types для всех моделей и enum union types. Двойной re-export нужен потому,
// что Prisma exposes enums как value (object) и type (union) под одним именем.
export {
  PrismaClient,
  Prisma,
  // runtime enum objects (must be re-exported as values, not types)
  UserRole,
  UserStatus,
  ApiKeyStatus,
  VerificationTokenType,
  Currency,
  WalletKind,
  TransactionType,
  TransactionStatus,
  ReservationStatus,
  DepositStatus,
  PaymentProvider,
  BundleMethod,
  BundleUnit,
  PriceSource,
  CouponType,
  CouponStatus,
  CatalogStatus,
  AvailabilityScope,
  ApiRequestStatus,
  TaskStatus,
  TaskMode,
  ProviderAccountStatus,
  ProxyStatus,
  ProxyProtocol,
  ResultFileStatus,
  RateCardPriceType,
  WebhookDeliveryStatus,
} from '@prisma/client';

export type * from '@prisma/client';
