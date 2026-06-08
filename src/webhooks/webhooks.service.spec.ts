import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DepositWebhookDto } from './dto/deposit-webhook.dto';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let tx: {
    user: { findUnique: jest.Mock };
    deposit: { create: jest.Mock };
    balance: { upsert: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn() },
      deposit: { create: jest.fn() },
      balance: { upsert: jest.fn() },
    };
    prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    service = new WebhooksService(prisma as unknown as PrismaService);
  });

  const dto: DepositWebhookDto = {
    userId: 'user1',
    amount: 100,
    currency: 'USD',
    transactionId: 'txn_1',
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  it('credits the balance and records the deposit atomically', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user1' });
    tx.deposit.create.mockResolvedValue({ id: 'dep1' });
    tx.balance.upsert.mockResolvedValue({});

    const result = await service.processDeposit(dto);

    expect(result).toEqual({ status: 'processed', depositId: 'dep1' });
    // increment uses a Decimal of the exact amount
    const upsertArg = tx.balance.upsert.mock.calls[0][0];
    expect(upsertArg.update.amount.increment.toString()).toBe('100');
    expect(upsertArg.where.userId_currency).toEqual({
      userId: 'user1',
      currency: 'USD',
    });
  });

  it('is idempotent: a duplicate transactionId is ignored, not double-credited', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user1' });
    // Simulate the unique-constraint violation on transactionId.
    tx.deposit.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.processDeposit(dto);

    expect(result).toEqual({ status: 'duplicate' });
    expect(tx.balance.upsert).not.toHaveBeenCalled();
  });

  it('rejects a deposit for a non-existent user', async () => {
    tx.user.findUnique.mockResolvedValue(null);

    await expect(service.processDeposit(dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.deposit.create).not.toHaveBeenCalled();
  });
});
