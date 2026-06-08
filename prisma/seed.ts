/**
 * Seed script: creates demo users with starting balances and prints a JWT for
 * each so you can immediately call the authenticated endpoints.
 *
 * Run with:  npm run seed
 *
 * It boots a minimal Nest application context purely to reuse AuthService (so
 * tokens are signed with the same secret/algorithm/expiry the running app uses).
 */
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface SeedUser {
  email: string;
  balances: { currency: string; amount: string }[];
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'alice@example.com',
    balances: [
      { currency: 'USD', amount: '1000.00' },
      { currency: 'BTC', amount: '0.50000000' },
    ],
  },
  {
    email: 'bob@example.com',
    balances: [{ currency: 'USD', amount: '0.00' }],
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);

  // eslint-disable-next-line no-console
  console.log('\nSeeding users...\n');

  for (const seed of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: { email: seed.email },
      update: {},
      select: { id: true, email: true },
    });

    for (const b of seed.balances) {
      await prisma.balance.upsert({
        where: { userId_currency: { userId: user.id, currency: b.currency } },
        create: {
          userId: user.id,
          currency: b.currency,
          amount: new Prisma.Decimal(b.amount),
        },
        // Reset to the seed value on re-run for deterministic local testing.
        update: { amount: new Prisma.Decimal(b.amount) },
      });
    }

    const { accessToken } = await auth.issueTokenForUser(user.id);

    // eslint-disable-next-line no-console
    console.log(`User:    ${user.email}`);
    // eslint-disable-next-line no-console
    console.log(`  id:    ${user.id}`);
    // eslint-disable-next-line no-console
    console.log(
      `  bal:   ${seed.balances.map((b) => `${b.amount} ${b.currency}`).join(', ')}`,
    );
    // eslint-disable-next-line no-console
    console.log(`  JWT:   ${accessToken}\n`);
  }

  // eslint-disable-next-line no-console
  console.log(
    'Use a JWT as:  Authorization: Bearer <JWT>\n' +
      'Tip: tokens expire (JWT_EXPIRES_IN). Re-run `npm run seed` or use POST /auth/dev-token for a fresh one.\n',
  );

  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
