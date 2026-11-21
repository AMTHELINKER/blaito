import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_OPTIONAL_AUTH, IS_PUBLIC } from '../decorators/public.decorator';
import type { AccessTokenPayload, AuthUser } from './auth-user';

/** Garde globale : toute route exige un jeton d'accès, sauf @Public() / @OptionalAuth(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, targets);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extract(req);

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
        req.user = { id: payload.sub, role: payload.role };
        return true;
      } catch {
        // Route publique : un jeton invalide est ignoré. Ailleurs (y compris route optionnelle),
        // on répond 401 pour que le client rafraîchisse sa session plutôt que de lire en anonyme.
        if (isPublic) return true;
        throw new UnauthorizedException('Session expirée');
      }
    }
    if (isPublic || isOptional) return true;
    throw new UnauthorizedException('Authentification requise');
  }

  private extract(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}
