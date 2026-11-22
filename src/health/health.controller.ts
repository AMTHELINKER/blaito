import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { MailSender } from '../mail/mail-sender';

/**
 * Santé du service. Indique aussi les canaux actifs (sans aucun secret) : utile pour
 * diagnostiquer une configuration de production sans accès à l'hébergeur.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async check() {
    await this.db.query('SELECT 1');
    return {
      status: 'ok',
      mail: this.mail.channel,
      storage: this.config.storage.driver,
      realtime: this.config.redisUrl ? 'redis' : 'memory',
    };
  }
}
