import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class SaveProgressDto {
  @IsUUID() bookId: string;
  @IsUUID() chapterId: string;
  @IsInt() @Min(0) @Max(1_000_000) position: number;
  @IsOptional() @IsString() @MaxLength(64) shareToken?: string;
}

export class ShareQueryDto {
  @IsOptional() @IsString() @MaxLength(64) share?: string;
}
