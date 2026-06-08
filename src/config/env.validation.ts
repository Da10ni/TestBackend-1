import * as Joi from 'joi';

/**
 * Boot-time environment validation. The app refuses to start if any secret is
 * missing or weak — failing fast is safer than running with, e.g., an empty
 * JWT secret that would let anyone forge tokens.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  // Shared secret used to verify webhook HMAC signatures.
  WEBHOOK_SECRET: Joi.string().min(16).required(),

  // Secret used to sign/verify user JWTs.
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  // How far (in seconds) a webhook's X-Timestamp may drift from server time
  // before it is rejected as stale (replay window).
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(300),
});
