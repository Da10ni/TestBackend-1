/**
 * Helper to produce a valid signed deposit webhook for manual testing.
 *
 * Usage:
 *   npm run sign:webhook -- <userId> [amount] [currency] [transactionId]
 *
 * It prints a ready-to-paste curl command with a correct X-Signature and a
 * fresh X-Timestamp, using WEBHOOK_SECRET from your .env.
 */
import { createHmac } from 'node:crypto';
import { config as loadEnv } from 'dotenv';

loadEnv();

const [, , userId, amountArg, currencyArg, txnArg] = process.argv;

if (!userId) {
  // eslint-disable-next-line no-console
  console.error(
    'Usage: npm run sign:webhook -- <userId> [amount] [currency] [transactionId]',
  );
  process.exit(1);
}

const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  // eslint-disable-next-line no-console
  console.error('WEBHOOK_SECRET is not set in the environment / .env');
  process.exit(1);
}

const nowSeconds = Math.floor(Date.now() / 1000);
const body = {
  userId,
  amount: amountArg ? Number(amountArg) : 100,
  currency: currencyArg ?? 'USD',
  transactionId: txnArg ?? `txn_${nowSeconds}_${Math.floor(Math.random() * 1e6)}`,
  timestamp: new Date(nowSeconds * 1000).toISOString(),
};

// IMPORTANT: sign the exact bytes we will send. JSON.stringify here must match
// the request body byte-for-byte.
const rawBody = JSON.stringify(body);
const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

const port = process.env.PORT ?? '3000';

/* eslint-disable no-console */
console.log('\nRaw body:');
console.log(rawBody);
console.log('\nX-Signature:', signature);
console.log('X-Timestamp:', nowSeconds);
console.log('\ncurl (bash):\n');
console.log(
  `curl -i -X POST http://localhost:${port}/webhooks/deposit \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -H "X-Signature: ${signature}" \\\n` +
    `  -H "X-Timestamp: ${nowSeconds}" \\\n` +
    `  -d '${rawBody}'\n`,
);
/* eslint-enable no-console */
