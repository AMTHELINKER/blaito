import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { GrantPermission, ResourceType } from '../../shared';

export class ResourceQueryDto {
  @IsIn(['book', 'chapter']) resourceType: ResourceType;
  @IsUUID() resourceId: string;
}

export class CreateShareLinkDto {
  @IsIn(['book', 'chapter']) resourceType: ResourceType;
  @IsUUID() resourceId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  expiresAt?: string | null;
}

export class CreateGrantDto {
  @IsIn(['book', 'chapter']) resourceType: ResourceType;
  @IsUUID() resourceId: string;
  @IsString() @MaxLength(30) username: string;
  @IsOptional() @IsIn(['read', 'comment']) permission?: GrantPermission;
}
