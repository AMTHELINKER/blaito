import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/uuid.pipe';
import { SaveContentDto, UpdateChapterDto } from './dto/writing.dto';
import { WritingService } from './writing.service';

@ApiTags('chapters')
@ApiBearerAuth()
@Controller('chapters')
export class ChaptersController {
  constructor(private readonly writing: WritingService) {}

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string, @Body() dto: UpdateChapterDto) {
    return this.writing.updateChapter(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.removeChapter(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.restoreChapter(user.id, id);
  }

  @Get(':id/content')
  content(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.getContent(user.id, id);
  }

  @Put(':id/content')
  save(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string, @Body() dto: SaveContentDto) {
    return this.writing.saveContent(user.id, id, dto);
  }
}
