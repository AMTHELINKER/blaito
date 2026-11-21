import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { COVER_MAX_BYTES } from '../shared';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/uuid.pipe';
import { assertValidImage } from '../storage/image-validation';
import { StorageService } from '../storage/storage.service';
import {
  CreateBookDto,
  CreateChapterDto,
  ReorderChaptersDto,
  UpdateBookDto,
} from './dto/writing.dto';
import { WritingService } from './writing.service';

@ApiTags('books')
@ApiBearerAuth()
@Controller('books')
export class BooksController {
  constructor(
    private readonly writing: WritingService,
    private readonly storage: StorageService,
  ) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.writing.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookDto) {
    return this.writing.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.getOwned(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string, @Body() dto: UpdateBookDto) {
    return this.writing.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.remove(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.restore(user.id, id);
  }

  @Post(':id/cover')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: COVER_MAX_BYTES + 1 } }))
  async cover(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.writing.getOwned(user.id, id);
    const kind = assertValidImage(file);
    const url = await this.storage.putImage('covers', file.buffer, kind);
    const { previous, book } = await this.writing.setCover(user.id, id, url);
    await this.storage.remove(previous);
    return book;
  }

  @Get(':id/chapters')
  chapters(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.writing.listChapters(user.id, id);
  }

  @Post(':id/chapters')
  createChapter(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: CreateChapterDto,
  ) {
    return this.writing.createChapter(user.id, id, dto);
  }

  @Put(':id/chapters/order')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: ReorderChaptersDto,
  ) {
    return this.writing.reorderChapters(user.id, id, dto.chapterIds);
  }
}
