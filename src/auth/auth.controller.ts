import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { DevTokenDto } from './dto/dev-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /auth/dev-token  — TEST/DEV CONVENIENCE ONLY.
   *
   * Mints a JWT for any existing user id. This is intentionally a back door for
   * local testing, so it is HARD-DISABLED in production (returns 403). In a real
   * system, tokens would come from a proper login flow with credentials/MFA.
   */
  @Post('dev-token')
  @HttpCode(HttpStatus.OK)
  async devToken(@Body() dto: DevTokenDto): Promise<{ accessToken: string }> {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Disabled in production');
    }
    return this.authService.issueTokenForUser(dto.userId);
  }
}
