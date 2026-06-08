import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DepositWebhookDto } from './dto/deposit-webhook.dto';

export type DepositResult =
  | { status: 'processed'; depositId: string }
  | { status: 'duplicate' };

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Credits a verified deposit to the user's balance.
   *
   * Atomicity & idempotency:
   *  - The Deposit row (unique transactionId) and the balance increment happen
   *    in ONE transaction. Either both apply or neither does — no torn writes
   *    where money is credited but the audit row is missing (or vice-versa).
   *  - A duplicate transactionId raises P2002; we swallow it and report
   *    `duplicate` WITHOUT crediting again. This makes the endpoint safe under
   *    provider retries and replay of captured-but-valid webhooks.
   */
  async processDeposit(dto: DepositWebhookDto): Promise<DepositResult> {
    const providerTimestamp = this.parseProviderTimestamp(dto.timestamp);
    const amount = new Prisma.Decimal(dto.amount);

    try {
      const depositId = await this.prisma.$transaction(async (tx) => {
        // Ensure the target user exists inside the transaction so a deleted
        // user can't be credited, and we get a clear 404 instead of an opaque
        // FK error.
        const user = await tx.user.findUnique({
          where: { id: dto.userId },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException('User not found');
        }

        const deposit = await tx.deposit.create({
          data: {
            transactionId: dto.transactionId,
            userId: dto.userId,
            amount,
            currency: dto.currency,
            providerTimestamp,
          },
          select: { id: true },
        });

        await tx.balance.upsert({
          where: {
            userId_currency: { userId: dto.userId, currency: dto.currency },
          },
          create: {
            userId: dto.userId,
            currency: dto.currency,
            amount,
          },
          update: { amount: { increment: amount } },
        });

        return deposit.id;
      });

      this.logger.log(
        `Deposit ${dto.transactionId} credited ${dto.amount} ${dto.currency} to user ${dto.userId}`,
      );
      return { status: 'processed', depositId };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Unique violation on transactionId => already processed.
        this.logger.warn(
          `Duplicate deposit ignored: transactionId=${dto.transactionId}`,
        );
        return { status: 'duplicate' };
      }
      throw error;
    }
  }

  /**
   * Accepts ISO-8601 or epoch (seconds/ms) string timestamps. Falls back to
   * "now" only if unparseable — the value is for audit, not authorization, and
   * freshness is enforced separately on the signed X-Timestamp header.
   */
  private parseProviderTimestamp(raw: string): Date {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && raw.trim() !== '') {
      // Heuristic: 10-digit => seconds, 13-digit => ms.
      const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
}
