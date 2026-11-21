import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BooksController } from './books.controller';
import { ChaptersController } from './chapters.controller';
import { BookTag } from './entities/book-tag.entity';
import { Book } from './entities/book.entity';
import { ChapterContent } from './entities/chapter-content.entity';
import { ChapterVersion } from './entities/chapter-version.entity';
import { Chapter } from './entities/chapter.entity';
import { Tag } from './entities/tag.entity';
import { WritingService } from './writing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Book, Chapter, ChapterContent, ChapterVersion, Tag, BookTag])],
  controllers: [BooksController, ChaptersController],
  providers: [WritingService],
  exports: [WritingService],
})
export class WritingModule {}
