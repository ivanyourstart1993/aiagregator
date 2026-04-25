# Northflank deployment guide

> Эта инструкция реальна на момент Чанка 1 (только скелет). По мере появления
> функциональности (миграции, секреты, build pipelines) обновляется.

## Project

`aiagregator` — один Northflank project.

## Addons

| Addon | План | Назначение |
| --- | --- | --- |
| PostgreSQL | minimal | Основная БД |
| Redis | minimal | BullMQ queues, idempotency cache, pricing cache |
| MinIO (S3-compatible) | minimal | Хранение результатов генераций (Этап 7+) |

После создания каждого addon — пробросить connection string в соответствующий **Secret Group**.

## Secret Groups

| Secret Group | Содержимое |
| --- | --- |
| `aiagg-db` | `DATABASE_URL` |
| `aiagg-redis` | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL` |
| `aiagg-s3` | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` |
| `aiagg-auth` | `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `aiagg-mail` | `RESEND_API_KEY`, `RESEND_FROM` |
| `aiagg-keys` | `API_KEY_PEPPER` |
| `aiagg-payments` | `CRYPTOMUS_MERCHANT_ID`, `CRYPTOMUS_API_KEY`, `CRYPTOMUS_IP_ALLOWLIST` (Этап 2) |
| `aiagg-bootstrap` | `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` |

## Services

| Service | Source | Port | Health | Secret Groups |
| --- | --- | --- | --- | --- |
| `api-service` | `apps/api`, Dockerfile (TBD), Node 20 | 4000 | `GET /health` | aiagg-db, aiagg-redis, aiagg-s3, aiagg-auth, aiagg-mail, aiagg-keys, aiagg-payments |
| `frontend-service` | `apps/web`, Dockerfile (TBD), Node 20 | 3000 | `GET /` | aiagg-auth |
| `worker-service` | `apps/worker`, Dockerfile (TBD), Node 20 | n/a | (BullMQ heartbeat) | aiagg-db, aiagg-redis, aiagg-s3, aiagg-mail |

## Jobs / Cron (добавляются по мере реализации этапов)

| Job | Schedule | Назначение |
| --- | --- | --- |
| `db-migrations` | on deploy | `pnpm db:migrate:deploy` |
| `db-seed` | manual | `pnpm db:seed` (super_admin bootstrap) |
| `proxy-health-check` | every 5–10 min | Этап 11 |
| `provider-account-health-check` | every 10 min | Этап 11 |
| `expired-task-check` | every 1 min | Этап 10 |
| `file-cleanup` | daily | Этап 15 (TTL 30 дней) |
| `webhook-retry` | every 1 min | Этап 10 |

## Build pipelines

В Чанке 4 будут добавлены `Dockerfile` и `.dockerignore` для каждого сервиса. Сейчас можно билдить
из source через `pnpm build` локально.

## External proxy layer

Прокси не размещаются на Northflank. Поднимаются на 2–3 VPS со static IP (Squid / 3proxy).
Назначение прокси к provider account настраивается в админке (Этап 11).
