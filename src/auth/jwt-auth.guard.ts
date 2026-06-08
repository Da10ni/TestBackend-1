import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guard that enforces a valid JWT. Throws 401 on missing/invalid/expired token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
