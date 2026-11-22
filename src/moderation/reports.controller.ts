import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/moderation.dto';
import { ModerationService } from './moderation.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly moderation: ModerationService) {}

  /** Signaler un livre, un chapitre, un profil ou un message. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.moderation.createReport(user.id, dto);
  }
}
