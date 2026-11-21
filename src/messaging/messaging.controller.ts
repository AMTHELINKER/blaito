import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/uuid.pipe';
import {
  AddMembersDto,
  ConversationsQueryDto,
  CreateDirectDto,
  CreateGroupDto,
  MessagesQueryDto,
  SendMessageDto,
  UpdateConversationDto,
} from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ConversationsQueryDto) {
    return this.messaging.list(user.id, q.cursor, q.limit);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.messaging.unreadTotal(user.id);
  }

  @Post('direct')
  openDirect(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectDto) {
    return this.messaging.openDirect(user.id, dto.userId);
  }

  @Post('group')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.messaging.createGroup(user.id, dto.title, dto.memberIds);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.messaging.get(user.id, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.messaging.rename(user.id, id, dto.title);
  }

  @Post(':id/members')
  addMembers(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.messaging.addMembers(user.id, id, dto.userIds);
  }

  /** Retirer un membre ; avec son propre identifiant : quitter le groupe. */
  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Param('userId', UuidParam) userId: string,
  ) {
    return this.messaging.removeMember(user.id, id, userId);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.messaging.listMessages(user.id, id, q.before, q.limit);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.send(user.id, id, dto.body, dto.clientId);
  }

  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  deleteMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParam) id: string,
    @Param('messageId', UuidParam) messageId: string,
  ) {
    return this.messaging.deleteMessage(user.id, id, messageId);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.messaging.markRead(user.id, id);
  }
}
