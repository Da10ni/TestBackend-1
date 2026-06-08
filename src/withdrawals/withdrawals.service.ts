import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Requests a withdrawal for the authenticated user.
   *
   * THE critical security path. The check-and-deduct must be atomic, otherwise
   * two concurrent requests could both read "balance = 100", both pass the
   * "balance >= 80" check, and both deduct — overdrawing the account
   * (TOCTOU race). We avoid the read-then-write race entirely with a single
   * conditional UPDATE:
   *
   *     UPDATE balance
   *        SET amount = amount - :amt
   *      WHERE userId = :u AND currency = :c AND amount >= :amt
   *
   * Postgres takes a row lock for the UPDATE, so concurrent updates serialize.
   * If 0 rows match, funds are insufficient (or the balance doesn't exist) and
   * we abort the transaction — no deduction, no withdrawal row. The whole thing
   * runs in one transaction so the deduction and the Withdrawal record commit
   * together or not at all.
   */
  async requestWithdrawal(
    userId: string,
    dto: CreateWithdrawalDto,
  ): Promise<{ withdrawalId: string; status: string }> {
    const amount = new Prisma.Decimal(dto.amount);

    try {
      const withdrawal = await this.prisma.$transaction(async (tx) => {
        const deduction = await tx.balance.updateMany({
          where: {
            userId,
            currency: dto.currency,
            amount: { gte: amount }, // atomic sufficient-funds check
          },
          data: { amount: { decrement: amount } },
        });

        if (deduction.count === 0) {
          // Either no balance in this currency, or not enough funds. We do not
          // distinguish (avoids leaking exact balances) — both mean "can't".
          throw new UnprocessableEntityException('Insufficient balance');
        }

        return tx.withdrawal.create({
          data: {
            userId,
            amount,
            currency: dto.currency,
            destinationAddress: dto.destinationAddress,
            status: 'PENDING',
          },
          select: { id: true, status: true },
        });
      });

      this.logger.log(
        `Withdrawal ${withdrawal.id} created for user ${userId}: ${dto.amount} ${dto.currency}`,
      );
      return { withdrawalId: withdrawal.id, status: withdrawal.status };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException('Invalid withdrawal request');
      }
      throw error;
    }
  }
}
