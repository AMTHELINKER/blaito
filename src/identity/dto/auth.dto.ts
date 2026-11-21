import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PASSWORD_MIN_LENGTH, type ThemeName } from '../../shared';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/i;

export class RegisterDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @MaxLength(128)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(USERNAME_PATTERN, {
    message: 'Pseudo : 3 à 30 caractères (lettres, chiffres, point, tiret, souligné)',
  })
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsIn(['parchment', 'light', 'sepia', 'night'])
  theme?: ThemeName;

  @IsOptional()
  @IsInt()
  @Min(14)
  @Max(28)
  fontSize?: number;
}

export class LoginDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class TokenDto {
  @IsString()
  @MaxLength(200)
  token: string;
}

export class EmailDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @MaxLength(128)
  password: string;
}
