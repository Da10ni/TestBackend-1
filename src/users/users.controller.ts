import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BalanceView, UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me/balance  (JWT-authenticated)
   * Returns the balances of the user identified by the token only.
   */
  @Get('me/balance')
  async getMyBalance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ userId: string; balances: BalanceView[] }> {
    const balances = await this.usersService.getBalances(user.id);
    return { userId: user.id, balances };
  }
}
