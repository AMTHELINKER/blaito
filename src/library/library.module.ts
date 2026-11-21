import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { SharingModule } from '../sharing/sharing.module';
import { WritingModule } from '../writing/writing.module';
import { Bookmark } from './entities/bookmark.entity';
import { ReadingProgress } from './entities/reading-progress.entity';
import { LibraryService } from './library.service';
import { ReadingController } from './reading.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReadingProgress, Bookmark]), SharingModule, WritingModule, IdentityModule],
  controllers: [ReadingController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
