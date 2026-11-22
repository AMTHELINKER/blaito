import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  type ReportDecision,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
  type UserRole,
} from '../../shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const TARGETS: ReportTargetType[] = ['book', 'chapter', 'user', 'message'];

export class CreateReportDto {
  @IsIn(TARGETS) targetType: ReportTargetType;
  @IsUUID() targetId: string;
  @IsIn(REPORT_REASONS) reason: ReportReason;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(REPORT_DETAILS_MAX_LENGTH)
  details?: string;
}

export class ReportsQueryDto {
  @IsOptional() @IsIn(['open', 'resolved', 'dismissed']) status?: ReportStatus;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
}

export class ResolveReportDto {
  @IsIn(['dismiss', 'hide', 'suspend']) decision: ReportDecision;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

export class ReasonDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

export class UsersQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
}

export class RoleDto {
  @IsIn(['user', 'moderator', 'admin']) role: UserRole;
}

export class ContentParamsDto {
  @IsIn(['book', 'chapter', 'message']) type: 'book' | 'chapter' | 'message';
  @IsUUID() id: string;
}
