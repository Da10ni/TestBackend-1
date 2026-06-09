import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express, Request, Response } from 'express';
import { AppModule } from '../src/app.module';

// Vercel runs this file as a single serverless function. We boot Nest ONCE
// (on the first request / cold start) and reuse the same Express instance for
// every subsequent invocation in that warm container.
const server: Express = express();
let ready: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    // Keep the raw body so the webhook HMAC guard verifies the exact bytes.
    rawBody: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  // IMPORTANT: init(), NOT listen(). Vercel owns the HTTP server.
  await app.init();
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ready) {
    ready = bootstrap();
  }
  await ready;
  server(req, res);
}
