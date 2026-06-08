import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /** Liveness probe — used by the docker compose healthcheck. */
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
