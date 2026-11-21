import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class SearchUsersDto {
  @IsString() @MinLength(2) @MaxLength(50) q: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Recherche de personnes par pseudo ou nom (ajout d'amis). */
  @Get('search')
  async search(@CurrentUser() user: AuthUser, @Query() { q }: SearchUsersDto) {
    const ids = (await this.users.searchUserIds(q.trim().replace(/^@/, ''), 11)).filter(
      (id) => id !== user.id,
    );
    const profiles = await this.users.getPublicProfiles(ids);
    return ids.slice(0, 10).flatMap((id) => profiles.get(id) ?? []);
  }
}
