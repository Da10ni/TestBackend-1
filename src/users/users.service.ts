import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface BalanceView {
  currency: string;
  amount: string; // serialized Decimal as string to avoid float precision loss
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all per-currency balances for a user. Decimal amounts are rendered
   * as strings — sending them as JSON numbers could silently lose precision on
   * the client for large values.
   */
  async getBalances(userId: string): Promise<BalanceView[]> {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
      select: { currency: true, amount: true },
      orderBy: { currency: 'asc' },
    });
    return balances.map((b) => ({
      currency: b.currency,
      amount: b.amount.toString(),
    }));
  }
}
