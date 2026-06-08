import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
@UseGuards(JwtAuthGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  /**
   * POST /withdrawals  (JWT-authenticated)
   *
   * The user id comes from the verified token (CurrentUser), never from the
   * body — a client cannot withdraw from someone else's account.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<{ withdrawalId: string; status: string }> {
    return this.withdrawalsService.requestWithdrawal(user.id, dto);
  }
}
