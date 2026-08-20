# Деплой на один VPS (≈ €20/мес)

Цель — увести всё с Northflank на одну недорогую KVM-машину (например
**ukraine.com.ua VPS 6G**: 2 vCPU / 6 GB RAM / 50 GB NVMe, €18.69). Рассчитано на
случай «нагрузки почти нет».

Стек AI Aggregator: `postgres + redis + minio + api + worker + web + admin`,
всё за одним reverse-proxy Caddy с автоматическим HTTPS.

> ⚠️ Сервер покупаешь и оплачиваешь сам (ввод платёжных данных). Ниже — всё
> остальное «под ключ».

---

## 0. Что учесть заранее

- **Диск.** Фото/результаты лежат в MinIO. На Northflank под MinIO было выделено
  30 GB (aiagg) + 6 GB (visavo), но реальных данных почти нет — при переезде
  хранилище стартует с чистого листа, поэтому 50 GB VPS 6G достаточно. Если со
  временем результаты генераций сильно вырастут — вынеси этот бакет в дешёвое
  объектное хранилище (Cloudflare R2 / Backblaze B2, S3-совместимо: меняется
  только endpoint и ключи в `.env.prod`).
- **Сборка тяжёлая.** Next.js билдится с лимитом 4 GB RAM. На 6 GB это ок только
  со swap и последовательной сборкой (шаг 4). Альтернатива на будущее — собирать
  образы в GitHub Actions и пушить в GHCR, чтобы VPS их только тянул.
- **Одна машина = одна точка отказа.** HA нет. Для прод-мобилки прими осознанно.
- **Локация — Киев.** Инфраструктурный риск во время войны. Взвесь.

---

## 1. Провижн сервера

После покупки VPS (Ubuntu 24.04) заходишь по SSH под root:

```bash
ssh root@SERVER_IP
```

Базовая настройка + Docker:

```bash
# пользователь без root для работы
adduser deploy && usermod -aG sudo deploy

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# firewall: только SSH + HTTP + HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Swap (обязательно на 6 GB, чтобы сборка не падала по OOM)

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Код и переменные

```bash
su - deploy
git clone https://github.com/<owner>/aiagregator.git
cd aiagregator

cp infra/.env.prod.example infra/.env.prod
# сгенерировать секреты: openssl rand -base64 32
nano infra/.env.prod          # заполнить домены, пароли, ключи
```

## 4. Сборка (последовательно, чтобы влезть в память)

```bash
cd ~/aiagregator
export COMPOSE=infra/docker-compose.prod.yml
export ENVF=infra/.env.prod

# по одному образу, без параллелизма:
DOCKER_BUILDKIT=1 docker compose -f $COMPOSE --env-file $ENVF build api
DOCKER_BUILDKIT=1 docker compose -f $COMPOSE --env-file $ENVF build worker
DOCKER_BUILDKIT=1 docker compose -f $COMPOSE --env-file $ENVF build web
DOCKER_BUILDKIT=1 docker compose -f $COMPOSE --env-file $ENVF build admin
```

## 5. DNS

В панели домена заведи A-записи на IP сервера **до** запуска (Caddy выпускает
сертификаты по этим доменам):

```
example.com        A   SERVER_IP     (APP_DOMAIN)
admin.example.com  A   SERVER_IP     (ADMIN_DOMAIN)
api.example.com    A   SERVER_IP     (API_DOMAIN)
```

## 6. Запуск

```bash
docker compose -f $COMPOSE --env-file $ENVF up -d
docker compose -f $COMPOSE --env-file $ENVF ps
docker compose -f $COMPOSE --env-file $ENVF logs -f caddy   # проверить выпуск TLS
```

Порядок стартапа зашит в compose: `postgres/redis/minio` → `migrate` (Prisma
migrate deploy) + `minio-init` (создаёт бакет) → `api/worker` → `web/admin` →
`caddy`.

## 7. Проверка

```bash
curl -I https://api.example.com/health   # 200 OK
curl -I https://example.com              # 200 OK
curl -I https://admin.example.com        # 200 OK
```

## 8. Бэкапы (не полагайся только на снапшоты хостера)

Ночной дамп Postgres + синк MinIO. Пример cron (`crontab -e` под deploy):

```bash
# 03:00 каждый день — дамп базы
0 3 * * * docker exec aiagg-postgres pg_dump -U aiagg aiagg | gzip > ~/backups/pg-$(date +\%F).sql.gz
# хранить 14 дней
30 3 * * * find ~/backups -name 'pg-*.sql.gz' -mtime +14 -delete
```

Дамп желательно копировать наружу (S3/другой сервер) — иначе он умрёт вместе с VPS.

## 9. Обновление после пуша в git

```bash
cd ~/aiagregator && git pull
docker compose -f $COMPOSE --env-file $ENVF build <изменённый-сервис>
docker compose -f $COMPOSE --env-file $ENVF up -d
```

> Чтобы вернуть «push → авто-деплой» как на Northflank — поставь на VPS
> **Coolify** или **Dokploy** (бесплатные self-hosted PaaS): дают UI, деплой из
> GitHub по вебхуку и управление этим же compose-стеком.

---

## Второй продукт (Visavo) на этой же машине

Visavo (`app-photo-backend` + MongoDB + Redis + MinIO, репо
`amida-software/app-photo-backend`) ставится **отдельным compose-стеком на том же
хосте**, а трафик на `api.visavo.ai` идёт через тот же Caddy:

1. Клонируй репо Visavo рядом, подними его `docker-compose` (Mongo/Redis/MinIO +
   backend) в отдельном проекте — свои внутренние порты, свои volumes.
2. Подключи backend-контейнер Visavo к сети Caddy (общий external network) под
   именем `visavo-backend`.
3. Раскомментируй блок `api.visavo.ai` в `infra/Caddyfile` и перезапусти Caddy.
4. Перенеси данные: `mongodump`/`mongorestore` для Mongo, `mc mirror` для MinIO.

При нулевой нагрузке оба продукта уживаются на 6 GB, но следи за RAM
(`docker stats`) — если тесно, апгрейд до VPS 8G (€25) делается в пару кликов у
хостера без переустановки.
