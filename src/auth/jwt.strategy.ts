import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user id
  email?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Validates Bearer JWTs from the Authorization header.
 *
 * Security choices:
 *  - `ignoreExpiration: false` — expired tokens are rejected (short-lived
 *    tokens limit the blast radius of a leaked token).
 *  - Algorithm is pinned to HS256. Without pinning, a token could claim
 *    `alg: none` or a different algorithm and bypass verification.
 *  - We re-load the user from the DB on every request so tokens for
 *    deleted users stop working immediately, and the request only ever
 *    operates on a confirmed-real identity.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', ''),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
