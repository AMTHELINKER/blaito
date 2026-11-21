import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { assertValidImage, sniffImage } from './image-validation';

const file = (buffer: Buffer, size = buffer.length) => ({ buffer, size }) as Express.Multer.File;

describe('image validation', () => {
  it('détecte JPG, PNG et WebP par leurs octets', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffImage(Buffer.from('89504e470d0a1a0a00', 'hex'))?.ext).toBe('png');
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 ', 'ascii'))?.ext).toBe('webp');
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });
  it('refuse plus de 5 Mo', () => {
    expect(() =>
      assertValidImage(file(Buffer.from([0xff, 0xd8, 0xff]), 5 * 1024 * 1024 + 1)),
    ).toThrow(PayloadTooLargeException);
  });
  it('refuse un format non supporté', () => {
    expect(() => assertValidImage(file(Buffer.from('<svg/>')))).toThrow(BadRequestException);
  });
});
