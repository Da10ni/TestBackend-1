import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      // Abort startup if env is invalid (missing secrets, etc.).
      validationOptions: { abortEarly: false },
    }),
    PrismaModule,
    AuthModule,
    WebhooksModule,
    WithdrawalsModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
