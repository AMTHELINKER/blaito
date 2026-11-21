import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { COVER_MAX_BYTES } from '../shared';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Events, UserExportEvent } from '../common/events';
import { assertValidImage } from '../storage/image-validation';
import { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './auth.controller';
import { DeleteAccountDto, UpdateProfileDto, UpdateSettingsDto } from './dto/me.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: COVER_MAX_BYTES + 1 } }))
  async avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    const kind = assertValidImage(file);
    const url = await this.storage.putImage('avatars', file.buffer, kind);
    const { previous, profile } = await this.users.setAvatar(user.id, url);
    await this.storage.remove(previous);
    return profile;
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(user.id, dto);
  }

  /** Export RGPD : toutes les données de l'utilisateur, tous domaines confondus. */
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="laito-export.json"')
  async export(@CurrentUser() user: AuthUser) {
    const identity = await this.users.exportData(user.id);
    const parts = await this.events.emitAsync(Events.UserExport, {
      userId: user.id,
    } satisfies UserExportEvent);
    return Object.assign(
      { exportedAt: new Date().toISOString(), identity },
      ...parts.filter((p) => p && typeof p === 'object'),
    );
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.deleteAccount(user.id, dto.password);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
