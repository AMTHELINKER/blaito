import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/public.decorator';
import { UuidParam } from '../common/uuid.pipe';
import { SaveProgressDto, ShareQueryDto } from './dto/reading.dto';
import { LibraryService } from './library.service';

@ApiTags('read')
@ApiBearerAuth()
@Controller('read')
export class ReadingController {
  constructor(private readonly library: LibraryService) {}

  @OptionalAuth()
  @Get('books/:id')
  book(@CurrentUser() user: AuthUser | undefined, @Param('id', UuidParam) id: string, @Query() q: ShareQueryDto) {
    return this.library.readBook(user?.id ?? null, id, q.share);
  }

  @OptionalAuth()
  @Get('chapters/:id')
  chapter(@CurrentUser() user: AuthUser | undefined, @Param('id', UuidParam) id: string, @Query() q: ShareQueryDto) {
    return this.library.readChapter(user?.id ?? null, id, q.share);
  }

  @Put('progress')
  saveProgress(@CurrentUser() user: AuthUser, @Body() dto: SaveProgressDto) {
    return this.library.saveProgress(user.id, dto);
  }

  @Get('progress')
  listProgress(@CurrentUser() user: AuthUser) {
    return this.library.listProgress(user.id);
  }
}
