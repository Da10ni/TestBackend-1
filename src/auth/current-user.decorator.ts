import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './jwt.strategy';

/**
 * Extracts the authenticated user that JwtStrategy.validate() attached to the
 * request. Always use this instead of reading an id from the request body —
 * the identity must come from the verified token, never from client input.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
