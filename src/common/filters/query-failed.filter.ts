import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

/** Traduit les violations d'unicité PostgreSQL en 409 plutôt qu'en 500. */
@Catch(QueryFailedError)
export class QueryFailedFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  catch(exception: QueryFailedError & { code?: string; detail?: string }, host: ArgumentsHost) {
    let mapped: HttpException | undefined;
    if (exception.code === '23505')
      mapped = new ConflictException('Cette valeur est déjà utilisée');
    if (exception.code === '22P02') mapped = new HttpException('Ressource introuvable', 404);
    if (!mapped) this.logger.error(exception.message, exception.stack);
    super.catch(mapped ?? exception, host);
  }
}
