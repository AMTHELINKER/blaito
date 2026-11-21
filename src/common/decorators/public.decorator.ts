import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'laito:isPublic';
export const IS_OPTIONAL_AUTH = 'laito:optionalAuth';

/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route accessible sans authentification, mais l'utilisateur est identifié si un jeton valide est fourni. */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH, true);
