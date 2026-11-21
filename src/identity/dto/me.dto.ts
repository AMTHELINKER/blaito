import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Locale, ReadingPreferences, ThemeName } from '../../shared';
import { USERNAME_PATTERN } from './auth.dto';

export class UpdateProfileDto {
  @IsOptional()
  @Matches(USERNAME_PATTERN, {
    message: 'Pseudo : 3 à 30 caractères (lettres, chiffres, point, tiret, souligné)',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  links?: string[];
}

export class ReadingPreferencesDto implements Partial<ReadingPreferences> {
  @IsOptional() @IsIn(['parchment', 'light', 'sepia', 'night']) theme?: ThemeName;
  @IsOptional() @IsIn(['literata', 'lora', 'inter']) fontFamily?: ReadingPreferences['fontFamily'];
  @IsOptional() @IsInt() @Min(14) @Max(28) fontSize?: number;
  @IsOptional() @IsNumber() @Min(1.3) @Max(2.2) lineHeight?: number;
  @IsOptional() @IsIn(['narrow', 'normal', 'wide']) margin?: ReadingPreferences['margin'];
  @IsOptional() @IsBoolean() justify?: boolean;
  @IsOptional() @IsIn(['scroll', 'paged']) mode?: ReadingPreferences['mode'];
}

export class UpdateSettingsDto {
  @IsOptional() @IsIn(['fr', 'en']) locale?: Locale;
  @IsOptional() @IsIn(['parchment', 'light', 'sepia', 'night']) theme?: ThemeName;
  @IsOptional() @IsBoolean() notificationsEnabled?: boolean;
  @IsOptional() @IsBoolean() onboardingCompleted?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReadingPreferencesDto)
  readingPreferences?: ReadingPreferencesDto;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(128)
  password: string;
}
