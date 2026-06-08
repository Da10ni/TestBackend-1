/**
 * Security-critical paths — required by the brief — exercised end-to-end through
 * the REAL HTTP stack against a REAL, ephemeral Postgres started by Testcontainers.
 *
 * Runs under plain `npm test` with no manual DB setup; it only needs Docker to be
 * running (the same prerequisite as the rest of the project). Covers:
 *   1. valid webhook is accepted and increments balance
 *   2. invalid signature is rejected (and does not credit)
 *   3. replay (same webhook twice) is handled (idempotent, no double-credit)
 *   4. withdrawal cannot exceed available balance
 *   5. two concurrent withdrawals for the same user don't double-spend
 */
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './prisma/prisma.service';

// Secrets must exist before AppModule's Joi validation runs.
process.env.NODE_ENV = 'test';
process.env.WEBHOOK_SECRET ??= 'integration_webhook_secret_16+__';
process.env.JWT_SECRET ??= 'integration_jwt_secret_16+_chars_';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ??= '300';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const sign = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
const nowTs = (): string => String(Math.floor(Date.now() / 1000));

jest.setTimeout(180_000);

describe('Security-critical paths (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    // Set before Nest instantiates PrismaClient / runs Joi validation (init time,
    // not import time), so the app connects to the container DB.
    process.env.DATABASE_URL = container.getConnectionUri();

    // Apply migrations to the fresh container DB.
    execSync('npx prisma migrate deploy', {
      stdio: 'ignore',
      env: process.env,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  const makeUser = async (
    email: string,
    usdBalance?: string,
  ): Promise<{ id: string; token: string }> => {
    const user = await prisma.user.create({
      data: { email },
      select: { id: true },
    });
    if (usdBalance !== undefined) {
      await prisma.balance.create({
        data: { userId: user.id, currency: 'USD', amount: usdBalance },
      });
    }
    const { accessToken } = await auth.issueTokenForUser(user.id);
    return { id: user.id, token: accessToken };
  };

  const postDeposit = (body: object, sig: string, ts: string) =>
    request(app.getHttpServer())
      .post('/webhooks/deposit')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .set('X-Timestamp', ts)
      .send(JSON.stringify(body));

  it('1) accepts a valid webhook and increments the balance', async () => {
    const { id } = await makeUser('valid-webhook@example.com');
    const body = {
      userId: id,
      amount: 500,
      currency: 'USD',
      transactionId: 'int_valid_1',
      timestamp: new Date().toISOString(),
    };
    const raw = JSON.stringify(body);

    const res = await postDeposit(body, sign(raw), nowTs()).expect(200);
    expect(res.body.status).toBe('processed');

    const bal = await prisma.balance.findFirst({
      where: { userId: id, currency: 'USD' },
    });
    expect(bal?.amount.toString()).toBe('500');
  });

  it('2) rejects an invalid signature and does not credit', async () => {
    const { id } = await makeUser('bad-sig@example.com');
    const body = {
      userId: id,
      amount: 500,
      currency: 'USD',
      transactionId: 'int_bad_sig',
      timestamp: new Date().toISOString(),
    };
    await postDeposit(body, 'deadbeef'.repeat(8), nowTs()).expect(401);

    const bal = await prisma.balance.findFirst({ where: { userId: id } });
    expect(bal).toBeNull();
  });

  it('3) handles replay: the same webhook sent twice credits only once', async () => {
    const { id } = await makeUser('replay@example.com');
    const body = {
      userId: id,
      amount: 500,
      currency: 'USD',
      transactionId: 'int_replay_1',
      timestamp: new Date().toISOString(),
    };
    const raw = JSON.stringify(body);

    const first = await postDeposit(body, sign(raw), nowTs()).expect(200);
    expect(first.body.status).toBe('processed');

    const second = await postDeposit(body, sign(raw), nowTs()).expect(200);
    expect(second.body.status).toBe('duplicate');

    const bal = await prisma.balance.findFirst({
      where: { userId: id, currency: 'USD' },
    });
    expect(bal?.amount.toString()).toBe('500'); // not 1000
  });

  it('4) rejects a withdrawal that exceeds the available balance', async () => {
    const { id, token } = await makeUser('insufficient@example.com', '100');

    await request(app.getHttpServer())
      .post('/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, currency: 'USD', destinationAddress: '0xabc' })
      .expect(422);

    const bal = await prisma.balance.findFirst({
      where: { userId: id, currency: 'USD' },
    });
    expect(bal?.amount.toString()).toBe('100'); // untouched
  });

  it('5) does not double-spend under concurrent withdrawals', async () => {
    // Balance 300; fire 5 concurrent withdrawals of 100. At most 3 may succeed
    // and the balance must never go negative.
    const { id, token } = await makeUser('concurrent@example.com', '300');

    const attempts = Array.from({ length: 5 }, () =>
      request(app.getHttpServer())
        .post('/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, currency: 'USD', destinationAddress: '0xabc' }),
    );
    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.status === 201).length;

    expect(successes).toBe(3);

    const bal = await prisma.balance.findFirst({
      where: { userId: id, currency: 'USD' },
    });
    expect(bal?.amount.toString()).toBe('0');
    expect(Number(bal?.amount)).toBeGreaterThanOrEqual(0);

    const withdrawals = await prisma.withdrawal.count({
      where: { userId: id },
    });
    expect(withdrawals).toBe(3);
  });
});
