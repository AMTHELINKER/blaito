import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthResponse } from '../shared';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, IssuedSession } from './auth.service';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto/auth.dto';

export const REFRESH_COOKIE = 'laito_rt';
const COOKIE_PATH = '/api/v1/auth';

@ApiTags('auth')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body() dto: TokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.verifyEmail(dto.token, req.get('user-agent')));
  }

  @Post('resend-verification')
  @HttpCode(200)
  resend(@Body() dto: EmailDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.login(dto, req.get('user-agent')));
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      return this.withCookie(
        res,
        await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.get('user-agent')),
      );
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgot(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  private withCookie(res: Response, session: IssuedSession): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.env === 'production',
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return session.auth;
  }
}
