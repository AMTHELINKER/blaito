import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VISIBILITIES, WRITING_STATUSES, type Visibility, type WritingStatus } from '../../shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBookDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le titre est obligatoire' })
  @MaxLength(200)
  title: string;

  @IsOptional() @IsString() @MaxLength(4000) summary?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) genre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}

export class UpdateBookDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) summary?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) genre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional() @IsIn(WRITING_STATUSES) status?: WritingStatus;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: Visibility;
}

export class CreateChapterDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) title?: string;
}

export class UpdateChapterDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsIn(WRITING_STATUSES) status?: WritingStatus;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: Visibility;
}

export class SaveContentDto {
  @IsString()
  @MaxLength(2_000_000, { message: 'Chapitre trop long (2 millions de caractères maximum)' })
  content: string;

  @IsOptional() @IsInt() @Min(0) baseVersion?: number;
}

export class ReorderChaptersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  chapterIds: string[];
}
