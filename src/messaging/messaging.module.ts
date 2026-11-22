import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { SocialModule } from '../social/social.module';
import { ConversationMember } from './entities/conversation-member.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationMember, Message]),
    IdentityModule,
    SocialModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, RealtimeGateway],
  exports: [MessagingService],
})
export class MessagingModule {}
