import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GROUP_MAX_MEMBERS, GROUP_TITLE_MAX_LENGTH, MESSAGE_MAX_LENGTH } from '../../shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateDirectDto {
  @IsUUID() userId: string;
}

export class CreateGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Donnez un nom au groupe' })
  @MaxLength(GROUP_TITLE_MAX_LENGTH)
  title: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un ami' })
  @ArrayMaxSize(GROUP_MAX_MEMBERS - 1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds: string[];
}

export class UpdateConversationDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Donnez un nom au groupe' })
  @MaxLength(GROUP_TITLE_MAX_LENGTH)
  title: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_MAX_MEMBERS - 1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds: string[];
}

export class SendMessageDto {
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH, { message: 'Message trop long (4 000 caractères maximum)' })
  body: string;

  @IsOptional() @IsString() @MaxLength(64) clientId?: string;
}

export class MessagesQueryDto {
  /** Identifiant du plus ancien message déjà chargé. */
  @IsOptional() @IsUUID() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ConversationsQueryDto {
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
