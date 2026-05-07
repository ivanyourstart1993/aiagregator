# crm-telethon (Phase 2 — Telegram sidecar service)

Python service that owns Telegram MTProto integration for the CRM. Runs
alongside the Node API/worker on Northflank as a separate deployment.

## Why a separate Python service

Telethon (the de-facto MTProto library for userbot accounts) is Python-only.
TDLib has Node bindings but they're flaky and require ~150MB of native libs
per worker. Easier to keep TG concerns isolated.

## Responsibilities

1. **Login flow for OutreachAccount rows**
   - Admin creates an OutreachAccount via the panel (api_id, api_hash, phone).
   - Admin clicks "Login" → service calls `client.send_code_request(phone)`,
     stores `phone_code_hash` in Redis under `tg:login:<accountId>`.
   - Telegram sends SMS to the phone → admin enters it in the panel →
     POST `/login/verify` with code → service calls `client.sign_in(phone, code,
     phone_code_hash)`, persists the resulting `StringSession` back to
     `outreach_account.sessionString`.
   - For 2FA-enabled accounts, also accept a `password` field.

2. **Enrichment** (consume `crm-enrichment` queue jobs)
   - Job payload: `{ leadId, type: 'TELEGRAM_CHANNEL', externalId: '<username>' }`
   - Pick a free OutreachAccount (one in `ACTIVE`/`WARMING` status, not
     blocked, has session). Use one consistent account per channel to avoid
     fingerprint mismatches.
   - Call `client.get_entity('@username')` → channel object with title,
     description, participants_count.
   - Call `client(GetFullChannelRequest(channel))` → admin user info.
     If `linked_chat` exists, fetch admin from there.
   - Update Lead row: `name`, `metadata` (subscribers, description),
     `telegramUsername` (canonical case), `score` (refined from real subs).
   - Move Lead `NEW` → `ENRICHED` and write a LeadStatusEvent
     (`changedBySystem: 'telethon-enrichment'`).

3. **Outreach send** (consume `crm-outreach` queue jobs)
   - Job payload: `{ leadId, conversationId, body, outreachAccountId }`
   - Load the OutreachAccount session, instantiate Telethon client with
     proxy from `proxy_id` (httpx-style proxy URL).
   - Honor rate limits: `account.todaySent < account.dailyLimit` AND
     warmup ramp (10/30/60/100% of dailyLimit by day-since-warmup).
   - `client.send_message('@username', body)` → store `external_message_id`
     in the Message row, mark `delivered = true`, increment
     `account.todaySent`.
   - On error: classify (PeerFloodError → status BLOCKED on the account;
     UserPrivacyRestrictedError → mark Lead BLOCKED; else just log).

4. **Inbound listener** (long-running per-account `client.run_until_disconnected()`)
   - Subscribe to `events.NewMessage(incoming=True)` on each session.
   - For each incoming DM, look up Conversation by externalChatId →
     create Message row (direction=INBOUND, author=LEAD).
   - Update Lead.firstReplyAt if first ever, status NEW/CONTACTED → REPLIED.
   - Enqueue `crm-reply` job (handled by Node worker, calls Claude API,
     enqueues outbound message back to this service).

## Tech stack

- Python 3.12
- `telethon>=1.36`
- `redis>=5` (BullMQ-compatible jobs reader, see [bullmq-py](https://github.com/taskforcesh/bullmq-py))
- `httpx[socks]` for proxy support
- `uvicorn` + `fastapi` (HTTP API for login/code flow only)

## Northflank deployment

- New service: `crm-telethon`, image built from `apps/crm-telethon/Dockerfile`
- Persistent volume mounted at `/data/sessions` (StringSession backups, in
  case Postgres write fails the in-memory session can be flushed here)
- Env: `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_BASE` (to call back
  into NestJS for non-trivial mutations)

## Outbound rate-limit discipline (read this before going live)

Telegram's anti-spam heuristics are not documented but well-studied. Safe-ish
limits per FRESH account:
- Day 1–3: ≤ 5 DMs/day to non-contacts
- Day 4–7: ≤ 15/day
- Day 8–14: ≤ 30/day
- After 14 days warm: ≤ 50/day, with random 2–8 minute gaps

Use **prewarmed** accounts (3+ weeks of organic activity — joining channels,
sending messages to real contacts, reading dialogs) before plugging into
the outreach pool. Buying "ready" accounts on grey markets has a >50% ban
rate within 2 weeks; spinning them up yourself is slower but durable.

If a single account triggers `PeerFloodError`, immediately:
1. Set status=BLOCKED in DB (no automatic recovery)
2. Pause the whole pool for 1 hour
3. Halve daily limits on the rest

## What's already wired (Node side, ready to integrate)

- `crm-enrichment` and `crm-outreach` BullMQ queues are registered in
  `apps/api/src/modules/bullmq/bullmq.module.ts` — the Python service can
  consume from them via bullmq-py.
- The DB schema has all required columns: `outreach_account.sessionString`,
  `conversation.externalChatId`, `message.externalMessageId`, etc.
- Status transitions are tracked via `LeadStatusEvent` — pass
  `changedBySystem='telethon-<step>'` so the audit trail is clear.

## What's NOT yet wired (do this when starting Phase 2)

- A `crm-reply` queue + Node-side worker that calls Claude API on inbound
  messages and enqueues an outbound back to this service.
- Periodic counter reset (BullMQ cron) for `outreach_account.todaySent`
  at midnight UTC.
- A `/login` REST endpoint in this service + a small "Login" button in
  the admin UI that POSTs `code` and stores the session.
