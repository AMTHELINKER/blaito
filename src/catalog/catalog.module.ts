import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { LibraryModule } from '../library/library.module';
import { WritingModule } from '../writing/writing.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [WritingModule, IdentityModule, LibraryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
