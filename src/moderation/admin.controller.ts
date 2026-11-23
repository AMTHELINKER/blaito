import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { Roles } from '../common/auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/uuid.pipe';
import {
  ContentParamsDto,
  ReasonDto,
  ReportsQueryDto,
  ResolveReportDto,
  RoleDto,
  UsersQueryDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';

/** Administration et modération : réservé aux modérateurs et administrateurs. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator', 'admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('stats')
  stats() {
    return this.moderation.stats();
  }

  @Get('reports')
  reports(@Query() q: ReportsQueryDto) {
    return this.moderation.listReports(q.status, q.cursor);
  }

  @Post('reports/:id/resolve')
  @HttpCode(204)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.moderation.resolveReport(user, id, dto.decision, dto.note);
  }

  @Post('content/:type/:id/hide')
  @HttpCode(204)
  hide(@CurrentUser() user: AuthUser, @Param() p: ContentParamsDto, @Body() dto: ReasonDto) {
    return this.moderation.hideContent(user, p.type, p.id, dto.reason);
  }

  @Post('content/:type/:id/unhide')
  @HttpCode(204)
  unhide(@CurrentUser() user: AuthUser, @Param() p: ContentParamsDto, @Body() dto: ReasonDto) {
    return this.moderation.unhideContent(user, p.type, p.id, dto.reason);
  }

  @Get('users')
  users(@Query() q: UsersQueryDto) {
    return this.moderation.listUsers(q.q, q.cursor);
  }

  @Post('users/:id/suspend')
  @HttpCode(204)
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.moderation.suspend(user, id, dto.reason);
  }

  @Post('users/:id/reinstate')
  @HttpCode(204)
  reinstate(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.moderation.reinstate(user, id, dto.reason);
  }

  @Roles('admin')
  @Patch('users/:id/role')
  @HttpCode(204)
  role(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string, @Body() dto: RoleDto) {
    return this.moderation.changeRole(user, id, dto.role);
  }

  /** Suppression définitive d'un compte et de ses données (admin uniquement). */
  @Roles('admin')
  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.moderation.deleteUser(user, id, dto.reason);
  }

  @Get('actions')
  actions(@Query('cursor') cursor?: string) {
    return this.moderation.listActions(cursor);
  }
}
