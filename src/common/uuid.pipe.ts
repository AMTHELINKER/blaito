import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant mal formé est traité comme introuvable (404), sans révéler quoi que ce soit. */
@Injectable()
export class UuidParam implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new NotFoundException();
    return value;
  }
}
