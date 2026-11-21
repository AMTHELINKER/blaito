import type { UserRole } from '../../shared';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}
