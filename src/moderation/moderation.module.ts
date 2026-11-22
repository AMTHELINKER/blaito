import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { MessagingModule } from '../messaging/messaging.module';
import { SharingModule } from '../sharing/sharing.module';
import { WritingModule } from '../writing/writing.module';
import { AdminController } from './admin.controller';
import { ModerationAction } from './entities/moderation-action.entity';
import { Report } from './entities/report.entity';
import { ModerationService } from './moderation.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ModerationAction]),
    IdentityModule,
    WritingModule,
    MessagingModule,
    SharingModule,
  ],
  controllers: [ReportsController, AdminController],
  providers: [ModerationService],
})
export class ModerationModule {}
