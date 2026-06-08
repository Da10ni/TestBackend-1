import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalsService } from './withdrawals.service';

describe('WithdrawalsService', () => {
  let service: WithdrawalsService;
  let tx: {
    balance: { updateMany: jest.Mock };
    withdrawal: { create: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    tx = {
      balance: { updateMany: jest.fn() },
      withdrawal: { create: jest.fn() },
    };
    // Run the interactive-transaction callback with our tx mock.
    prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    service = new WithdrawalsService(prisma as unknown as PrismaService);
  });

  const dto = { amount: 80, currency: 'USD', destinationAddress: '0xabc' };

  it('deducts atomically with a sufficient-funds guard and creates a PENDING withdrawal', async () => {
    tx.balance.updateMany.mockResolvedValue({ count: 1 });
    tx.withdrawal.create.mockResolvedValue({ id: 'w1', status: 'PENDING' });

    const result = await service.requestWithdrawal('user1', dto);

    expect(result).toEqual({ withdrawalId: 'w1', status: 'PENDING' });

    // The deduction MUST be a single conditional update that only matches when
    // amount >= requested — this is what prevents the overdraft race.
    const call = tx.balance.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ userId: 'user1', currency: 'USD' });
    expect(call.where.amount.gte).toBeInstanceOf(Prisma.Decimal);
    expect(call.where.amount.gte.toString()).toBe('80');
    expect(call.data.amount.decrement.toString()).toBe('80');
  });

  it('rejects with 422 and creates NO withdrawal when funds are insufficient', async () => {
    // count === 0 => the conditional update matched no row (insufficient/absent)
    tx.balance.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.requestWithdrawal('user1', dto),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.withdrawal.create).not.toHaveBeenCalled();
  });

  it('does not create a withdrawal if the balance update fails', async () => {
    tx.balance.updateMany.mockRejectedValue(new Error('db down'));
    await expect(service.requestWithdrawal('user1', dto)).rejects.toThrow();
    expect(tx.withdrawal.create).not.toHaveBeenCalled();
  });
});
