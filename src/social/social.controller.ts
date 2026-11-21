import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/uuid.pipe';
import { SocialService } from './social.service';

@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.social.list(user.id);
  }

  @Post(':username')
  request(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.social.request(user.id, username);
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('userId', UuidParam) userId: string) {
    return this.social.remove(user.id, userId);
  }
}
