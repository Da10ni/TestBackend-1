# Secure Webhook & Withdrawal Service

A NestJS service simulating a real-money slice: an HMAC-signed deposit webhook that credits
balances, and a JWT-authenticated withdrawal endpoint with atomic balance deduction.
TypeScript (strict) · PostgreSQL via Prisma · Jest.

> **Prisma note:** uses **Prisma 6** (stable). Prisma 7 uses a different setup model
> (driver adapters + `prisma.config.ts`); the data-access code here is unaffected.

## Setup

Prerequisite: Docker running.

```bash
docker compose up --build          # Postgres + API on :3000, runs migrations, seeds demo users
```

The seed prints two users and their JWTs to the logs. Health check: `GET /health`.

```bash
npm install && npm test            # unit + integration; spins its own ephemeral Postgres (Testcontainers)
```

Local (no Docker for the app): `cp .env.example .env` → `npm run prisma:deploy` → `npm run seed`
→ `npm run start:dev`. Get a fresh token: `POST /auth/dev-token {"userId":"..."}` (dev only).
Craft a signed webhook: `npm run sign:webhook -- <userId> 250 USD`.

Endpoints: `POST /webhooks/deposit` (`X-Signature`, `X-Timestamp`) · `POST /withdrawals` (Bearer JWT)
· `GET /users/me/balance` (Bearer JWT).

## Security decisions

1. **HMAC over the raw request bytes** (not re-serialized JSON) so the signature is checked against exactly what the provider signed.
2. **Constant-time signature comparison** (`crypto.timingSafeEqual`) so response timing can't leak how many bytes matched.
3. **Unique `transactionId` constraint** makes deposits idempotent, so retries/replays credit at most once.
4. **Atomic conditional deduction** — `UPDATE … WHERE amount >= :amt` in a transaction — eliminates the check-then-act race that causes overdrafts.
5. **Identity comes from the verified JWT, never the body**, so a caller can't withdraw from another account.
6. **Money is `Decimal`/`NUMERIC`, never float**, avoiding rounding and precision loss.
7. **JWT pinned to HS256 with enforced expiry + per-request DB user re-check**, blocking alg-confusion and deleted-user tokens.
8. **Fail-fast config (Joi) + strict `ValidationPipe`** (`whitelist` + `forbidNonWhitelisted`) reject weak secrets at boot and unexpected/over-precision input.

## Threats you defended against

Signature forgery & payload tampering · signature timing side-channel · webhook replay / double-processing
(unique txn id + timestamp freshness window) · **double-spend / overdraft under concurrency** ·
negative / zero / over-precision amounts · cross-account withdrawal (IDOR) · JWT alg-confusion, expired &
deleted-user tokens · mass-assignment of unexpected fields · insecure boot with missing/weak secrets.

## What you would do with two more days

- Add an `Idempotency-Key` for withdrawals and a webhook replay cache; sign `timestamp.body`.
- Rate limiting, structured audit logging with request IDs, and alerting on repeated 401s.
- Double-entry ledger + a withdrawal state machine with an async settlement worker and retries.
- Secrets manager + rotation + per-provider secrets; run the container as a non-root user.
- More tests: property-based precision tests, webhook fuzzing, load-testing the concurrency guard, currency-mismatch cases.

## AI tools used

Built with **Claude Code** (Anthropic's CLI, Opus model). It was used to scaffold the project,
implement both endpoints plus the auth/Prisma layers, write the Jest unit + Testcontainers integration
tests, author the Dockerfile/compose, and draft this README. Every change was verified by running
`npm test`, `npm run build`, `npm run lint`, and live `docker compose up` smoke tests against the
running service.
