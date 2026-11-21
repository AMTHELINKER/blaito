import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { SocialModule } from '../social/social.module';
import { WritingModule } from '../writing/writing.module';
import { AuthorizationService } from './authorization.service';
import { AccessGrant } from './entities/access-grant.entity';
import { ShareLink } from './entities/share-link.entity';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShareLink, AccessGrant]),
    WritingModule,
    SocialModule,
    IdentityModule,
  ],
  controllers: [SharingController],
  providers: [AuthorizationService, SharingService],
  exports: [AuthorizationService],
})
export class SharingModule {}
