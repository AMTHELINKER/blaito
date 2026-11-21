import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UuidParam } from '../common/uuid.pipe';
import { CreateGrantDto, CreateShareLinkDto, ResourceQueryDto } from './dto/sharing.dto';
import { SharingService } from './sharing.service';

@ApiTags('share')
@ApiBearerAuth()
@Controller('share')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get('links')
  links(@CurrentUser() user: AuthUser, @Query() q: ResourceQueryDto) {
    return this.sharing.listLinks(user.id, q.resourceType, q.resourceId);
  }

  @Post('links')
  createLink(@CurrentUser() user: AuthUser, @Body() dto: CreateShareLinkDto) {
    return this.sharing.createLink(user.id, dto);
  }

  @Delete('links/:id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.sharing.revokeLink(user.id, id);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('resolve/:token')
  resolve(@Param('token') token: string) {
    return this.sharing.resolve(token);
  }

  @Get('grants')
  grants(@CurrentUser() user: AuthUser, @Query() q: ResourceQueryDto) {
    return this.sharing.listGrants(user.id, q.resourceType, q.resourceId);
  }

  @Post('grants')
  createGrant(@CurrentUser() user: AuthUser, @Body() dto: CreateGrantDto) {
    return this.sharing.createGrant(user.id, dto);
  }

  @Delete('grants/:id')
  @HttpCode(204)
  removeGrant(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.sharing.removeGrant(user.id, id);
  }

  @Get('with-me')
  withMe(@CurrentUser() user: AuthUser) {
    return this.sharing.sharedWithMe(user.id);
  }
}
